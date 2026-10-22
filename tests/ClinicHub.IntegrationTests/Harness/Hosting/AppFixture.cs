using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Respawn;
using Respawn.Graph;

namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// One parallel test group (an xUnit collection, <see cref="ICollectionFixture{TFixture}"/>): its own copy of the
/// run's template database and its own app (<see cref="ClinicHubFactory"/>: own clock, own caches). Collections run in
/// parallel; the test classes of a collection run one after the other on its database.
/// <para>
/// Isolation (design D3): when a new test class starts (<see cref="BeforeTestAsync"/>), the database is reset by
/// Respawn (every table but the migrations history), the startup seeder runs again (template clinic + test super
/// admin: what a fresh template holds), the access cache is emptied and the per-class sessions are dropped. Tests of
/// one class share the database, so each builds its own data (unique names). The clock is reset before every test.
/// A test that started a variant app (<see cref="CreateVariant"/>: its startup seeder ran on this database) makes the
/// next test start as if it were a new class.
/// </para>
/// </summary>
public class AppFixture : IAsyncLifetime
{
    private readonly Dictionary<string, object> perClass = new();
    private Respawner respawner;
    private Type currentClass;
    private bool used;
    private bool dirty;

    public AppFixture()
    {
        Data = new TestData(this);
        Login = new Logins(this);
        Tokens = new AccessTokens(this);
    }

    public ClinicHubFactory Factory { get; private set; }
    /// <summary>This collection's database (<c>drags_it_&lt;run&gt;_&lt;n&gt;</c>).</summary>
    public string DatabaseName { get; private set; }
    public TestClock Clock => Factory.Clock;
    /// <summary>Builders: data through the real use cases.</summary>
    public TestData Data { get; }
    /// <summary>Logged-in clients through the real OTP flow.</summary>
    public Logins Login { get; }
    /// <summary>Access tokens with chosen times (token-lifetime cases).</summary>
    public AccessTokens Tokens { get; }

    /// <summary>The test super admin (<c>Platform:SuperAdminPhones</c> of <c>appsettings.Testing.json</c>), E.164.</summary>
    public string SuperAdminPhone => Factory.Services.GetRequiredService<PlatformSettings>().SuperAdminPhones[0];

    /// <summary>
    /// True for <see cref="BareAppFixture"/> (design M1.7 D12): a copy of the bare template (migrated and seeded, no
    /// catalog), reset without the baseline and checksum checks: the migration collection.
    /// </summary>
    protected virtual bool UsesBareTemplate => false;

    /// <summary>
    /// The baseline check after a reset and at dispose (design M1.7 D12): null = the imported rows are intact. A seam for
    /// CAT-228 (a test fixture overrides it to see the dispose's call); <see cref="BareAppFixture"/> has no catalog. A
    /// fixture whose app never started has nothing to check (null).
    /// </summary>
    protected virtual Task<BaselineViolation> CheckBaselineAsync(string lastClass) =>
        Factory is null
            ? Task.FromResult<BaselineViolation>(null)
            : BaselineGuard.CheckAsync(Factory.ConnectionString, TestRun.Baseline, lastClass);

    public async Task InitializeAsync()
    {
        DatabaseName = await TestRun.CreateCopyAsync(UsesBareTemplate);
        var connectionString = TestRun.ConnectionString(DatabaseName);
        Factory = await TestRun.StartAppAsync(() => new ClinicHubFactory(connectionString), $"the app of {DatabaseName}");
    }

    /// <summary>
    /// End of the collection: the baseline is checked once more (design M1.7 D12, CAT-228: a change made by the last
    /// class), then the app and the database go. A violation fails the collection (xUnit reports a fixture cleanup
    /// failure naming the class) after the cleanup.
    /// </summary>
    public async Task DisposeAsync()
    {
        BaselineViolation violation = null;
        System.Runtime.ExceptionServices.ExceptionDispatchInfo checkFailure = null;
        try
        {
            violation = await CheckBaselineAsync(LastClassName);
        }
        catch (Exception e)
        {
            // The cleanup runs anyway; the failed check is reported after it
            checkFailure = System.Runtime.ExceptionServices.ExceptionDispatchInfo.Capture(e);
        }
        await DisposeResourcesAsync();
        checkFailure?.Throw();
        if (violation is not null)
            throw new BaselineViolationException(violation);
    }

    private async Task DisposeResourcesAsync()
    {
        await DisposePerClassAsync();
        if (Factory is not null)
            await Factory.DisposeAsync();
        if (DatabaseName is null)
            return;
        try
        {
            await TestRun.DropAsync(DatabaseName);
        }
        catch (Exception e)
        {
            // Never a failed collection for it: the run drops it again at its end, else the next run's stale cleanup
            TestRun.Warn($"could not drop {DatabaseName} (dropped later): {e.Message}");
        }
    }

    /// <summary>
    /// Called by <see cref="IntegrationTest"/> before each test: clock reset; database reset on a new class (or after a
    /// variant app ran on the database).
    /// </summary>
    public async Task BeforeTestAsync(Type testClass)
    {
        // The cache keeps its answers across tests of a class, as a running server does: its own clock never goes back
        Clock.Reset();
        if (testClass == currentClass && !dirty)
            return;
        await DisposePerClassAsync();
        // A fresh copy is already clean. The class counts as started only once reset: a failed reset (a connection
        // failure under load) fails this test, and the next test of the class tries the reset again
        if (used || dirty)
            await ResetAsync();
        currentClass = testClass;
        used = true;
        dirty = false;
    }

    /// <summary>
    /// Empties the database (back to a fresh template: template clinic + test super admin, and the imported catalog)
    /// and the app's access cache. Ids keep growing (sequences are not reset), so an id never means two rows inside a
    /// run.
    /// <para>
    /// Design M1.7 D12, on a loaded copy: Respawn on every table but the migrations history, <c>Clinics</c>, <c>Drugs</c>,
    /// <c>Categories</c> and <c>SubCategories</c> (a truncate cascades into every table referencing a truncated one), then
    /// in one transaction the rows the tests added to those four (own drugs, test-created shared drugs, every clinic,
    /// test-created subcategories and categories); then the baseline check (<see cref="CheckBaselineAsync"/>); then the
    /// startup seeder. A violation re-creates the database from the template and throws, naming the class that changed
    /// the imported rows. A bare copy (<see cref="BareAppFixture"/>) is reset by Respawn on every table.
    /// </para>
    /// </summary>
    public async Task ResetAsync()
    {
        await using (var connection = new NpgsqlConnection(Factory.ConnectionString))
        {
            await connection.OpenAsync();
            respawner ??= await Respawner.CreateAsync(connection, new RespawnerOptions
            {
                DbAdapter = DbAdapter.Postgres,
                SchemasToInclude = ["public"],
                TablesToIgnore = UsesBareTemplate
                    ? [new Table("__EFMigrationsHistory")]
                    : [new Table("__EFMigrationsHistory"), new Table("Clinics"), new Table("Drugs"), new Table("Categories"),
                        new Table("SubCategories")],
            });
            await respawner.ResetAsync(connection);
            if (!UsesBareTemplate)
                await DeleteTestRowsAsync(connection, TestRun.Baseline);
        }
        var violation = await CheckBaselineAsync(LastClassName);
        if (violation is not null)
        {
            // The next classes run on a clean catalog: a fresh copy of the template (already seeded)
            await TestRun.RecreateCopyAsync(DatabaseName, UsesBareTemplate);
            Factory.ClearMemoryCache();
            throw new BaselineViolationException(violation);
        }
        await using (var scope = Factory.Services.CreateAsyncScope())
            await scope.ServiceProvider.GetRequiredService<IStartupSeeder>().SeedAsync(isDevelopment: false);
        // The database changed outside the app: nothing cached before may survive
        Factory.ClearMemoryCache();
    }

    /// <summary>The test class that ran last (named by a baseline violation).</summary>
    private string LastClassName => currentClass?.FullName ?? "(no test class ran)";

    /// <summary>The four deletes of the reset of a loaded copy (design M1.7 D12), in one transaction.</summary>
    private static async Task DeleteTestRowsAsync(NpgsqlConnection connection, CatalogBaseline baseline)
    {
        await using var transaction = await connection.BeginTransactionAsync();
        await using (var command = new NpgsqlCommand(
            """
            DELETE FROM "Drugs" WHERE "ClinicId" IS NOT NULL OR "Id" > @maxDrug;
            DELETE FROM "Clinics";
            DELETE FROM "SubCategories" WHERE "Id" > @maxSub;
            DELETE FROM "Categories" WHERE "Id" > @maxCat;
            """, connection, transaction))
        {
            command.Parameters.AddWithValue("maxDrug", baseline.MaxDrugId);
            command.Parameters.AddWithValue("maxSub", baseline.MaxSubCategoryId);
            command.Parameters.AddWithValue("maxCat", baseline.MaxCategoryId);
            await command.ExecuteNonQueryAsync();
        }
        await transaction.CommitAsync();
    }

    /// <summary>A new anonymous client with its own cookie jar (one browser).</summary>
    public ApiClient CreateClient() => new(Factory);

    /// <summary>Whether <see cref="PerClassAsync{T}"/> already holds a value for <paramref name="key"/>.</summary>
    public bool HasPerClass(string key) => perClass.ContainsKey(key);

    /// <summary>
    /// A value kept for the rest of the current test class (e.g. a logged-in session: the opt-in fast path), dropped
    /// (and disposed) when the next class starts. Never shared across classes.
    /// </summary>
    public async Task<T> PerClassAsync<T>(string key, Func<Task<T>> create)
    {
        if (perClass.TryGetValue(key, out var value))
            return (T)value;
        var created = await create();
        perClass[key] = created;
        return created;
    }

    private async Task DisposePerClassAsync()
    {
        foreach (var value in perClass.Values)
            if (value is IAsyncDisposable asyncDisposable)
                await asyncDisposable.DisposeAsync();
            else if (value is IDisposable disposable)
                disposable.Dispose();
        perClass.Clear();
    }

    /// <summary>
    /// Sends a use case (command or query) through MediatR in a new DI scope, as the app does (validation, transaction,
    /// post-commit actions), acting in <paramref name="clinicId"/> when given (unchecked, like <c>IClinicScope.Use</c>).
    /// There is no HTTP request: nothing reads the caller.
    /// </summary>
    public async Task<TResult> SendAsync<TResult>(IRequest<TResult> request, int? clinicId = null) where TResult : Result
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        using var _ = clinicId is { } id ? scope.ServiceProvider.GetRequiredService<IClinicScope>().Use(id) : null;
        return await scope.ServiceProvider.GetRequiredService<ISender>().Send(request);
    }

    /// <summary>
    /// Reads (or, for "changed outside the app" cases, writes) the database directly with a fresh
    /// <see cref="AppDbContext"/>. No clinic is set: clinic-owned tables need <c>IgnoreQueryFilters()</c>, and saving a
    /// clinic-owned row throws; use <see cref="OutsideTheApp"/> SQL for those.
    /// </summary>
    public async Task<T> QueryDbAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        await using var scope = Factory.Services.CreateAsyncScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    /// <summary>Raw SQL on this collection's database, for "changed outside the app" cases only (never to build data).</summary>
    public OutsideTheApp OutsideTheApp => new(Factory.ConnectionString);

    /// <summary>The template clinic's id (it changes after every reset).</summary>
    public Task<int> TemplateClinicIdAsync() =>
        QueryDbAsync(db => db.Clinics.Where(c => c.IsTemplate).Select(c => c.Id).SingleAsync());

    /// <summary>
    /// Another app on this collection's database with config and/or service overrides: a restart with other settings
    /// (startup refusals, another <c>Platform:SuperAdminPhones</c>), a throwing sender… Its startup runs the seeder on
    /// this database, so the next test starts on a reset database (as a new class would). It has its own clock and
    /// caches: after it starts, send every request through it (<c>new ApiClient(variant)</c>,
    /// <c>Login.On(variant)</c>) and move <c>variant.Clock</c>. Dispose it in the test (<c>await using</c>).
    /// </summary>
    public ClinicHubFactory CreateVariant(IReadOnlyDictionary<string, string> settings = null,
        Action<IServiceCollection> services = null)
    {
        dirty = true;
        return new ClinicHubFactory(Factory.ConnectionString, settings, services);
    }
}
