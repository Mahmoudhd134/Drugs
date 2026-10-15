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
    /// <summary>The app's time: <c>Clock.Advance(TimeSpan.FromSeconds(60))</c>.</summary>
    protected TestClock Clock => App.Clock;

    /// <summary>A new anonymous browser (own cookie jar, no token).</summary>
    protected ApiClient Anonymous() => App.CreateClient();

    public virtual Task InitializeAsync() => App.BeforeTestAsync(GetType());

    public virtual Task DisposeAsync() => Task.CompletedTask;
}
