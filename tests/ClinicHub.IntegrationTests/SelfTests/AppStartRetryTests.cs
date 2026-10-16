using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Npgsql;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// A collection's app that fails to start on a connection failure (a connect timeout under load) is started again
/// (<see cref="TestRun.StartAppAsync"/>), with a warning; any other startup failure throws at once. The failures are
/// simulated by a hosted service that throws while the app starts (after migrations and the seeder); the retries are
/// reported to the test, not as warnings of the run.
/// </summary>
[Collection(InfraCollectionB.Name)]
[Trait("Area", "infra")]
public class AppStartRetryTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task A_start_that_times_out_once_is_retried_and_the_app_works()
    {
        var starts = 0;
        var reported = new List<string>();
        await using var started = await TestRun.StartAppAsync(() => App.CreateVariant(services: s =>
            s.AddSingleton<IHostedService>(new FailingStart(() => ++starts == 1 ? new TimeoutException("simulated") : null))),
            "the app", reported.Add);

        starts.ShouldBe(2);
        reported.ShouldBe(["the app did not start (attempt 1 of 3, started again): simulated"]);
        await (await new ApiClient(started).RequestOtpAsync(Unique.Phone())).ShouldBeOkAsync();
    }

    [Fact]
    public async Task A_start_that_keeps_failing_on_connections_throws_after_the_last_attempt()
    {
        var starts = 0;
        var reported = new List<string>();

        await Should.ThrowAsync<TimeoutException>(() => TestRun.StartAppAsync(() => App.CreateVariant(services: s =>
            s.AddSingleton<IHostedService>(new FailingStart(() => { starts++; return new TimeoutException("simulated"); }))),
            "the app", reported.Add));

        starts.ShouldBe(TestRun.AppStartAttempts);
        reported.Count.ShouldBe(TestRun.AppStartAttempts - 1);
    }

    [Fact]
    public async Task Any_other_startup_failure_throws_at_once()
    {
        var starts = 0;
        var reported = new List<string>();

        await Should.ThrowAsync<InvalidOperationException>(() => TestRun.StartAppAsync(() => App.CreateVariant(services: s =>
            s.AddSingleton<IHostedService>(new FailingStart(() => { starts++; return new InvalidOperationException("a bad setting"); }))),
            "the app", reported.Add));

        starts.ShouldBe(1);
        reported.ShouldBeEmpty();
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Connection_failures_are_found_anywhere_in_the_exception_chain(bool wrapped)
    {
        Exception timeout = new NpgsqlException("The operation has timed out", new TimeoutException());
        if (wrapped)
            timeout = new AggregateException(new InvalidOperationException("startup", timeout));

        TestRun.IsConnectionFailure(timeout).ShouldBeTrue();
        TestRun.IsConnectionFailure(new InvalidOperationException("Otp:Mode")).ShouldBeFalse();
    }

    private sealed class FailingStart(Func<Exception> failure) : IHostedService
    {
        public Task StartAsync(CancellationToken cancellationToken) =>
            failure() is { } e ? Task.FromException(e) : Task.CompletedTask;

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
