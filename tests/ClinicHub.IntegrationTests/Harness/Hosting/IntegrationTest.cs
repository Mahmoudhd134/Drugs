using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;

namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// Base class of every integration test class. The class must belong to a collection that provides the
/// <see cref="AppFixture"/> (<c>[Collection(AuthCollection.Name)]</c>, see <c>docs/testing/README.md</c>); before each
/// test it resets the clock and, when a new class starts, the database.
/// </summary>
public abstract class IntegrationTest(AppFixture app) : IAsyncLifetime
{
    protected AppFixture App { get; } = app;
    /// <summary>Builders (real use cases).</summary>
    protected TestData Data => App.Data;
    /// <summary>Logged-in clients (real OTP flow).</summary>
    protected Logins Login => App.Login;
    /// <summary>The app's time, frozen during the test: <c>Clock.Advance(TimeSpan.FromSeconds(60))</c>.</summary>
    protected TestClock Clock => App.Clock;

    /// <summary>A new anonymous browser (own cookie jar, no token).</summary>
    protected ApiClient Anonymous() => App.CreateClient();

    /// <summary>Resets (clock; database on a new class), then <see cref="SetUpAsync"/>. Not overridable: use SetUpAsync.</summary>
    public async Task InitializeAsync()
    {
        await App.BeforeTestAsync(GetType());
        await SetUpAsync();
    }

    /// <summary>
    /// Per-test setup, after the reset (build data here or in the test, never in the constructor: the reset would wipe
    /// it; for data shared by the class use <see cref="AppFixture.PerClassAsync{T}"/>).
    /// </summary>
    protected virtual Task SetUpAsync() => Task.CompletedTask;

    public virtual Task DisposeAsync() => Task.CompletedTask;
}
