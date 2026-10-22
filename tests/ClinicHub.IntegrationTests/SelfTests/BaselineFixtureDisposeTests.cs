using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// The collection fixture's dispose runs the baseline check once more (design M1.7 D12), so a change made by the last
/// class of a collection is reported too. The fixture here answers the check itself (<c>CheckBaselineAsync</c>, the
/// seam of the contract): no database is checked or changed.
/// </summary>
[Trait("Area", "infra")]
public class BaselineFixtureDisposeTests
{
    /// <summary>A collection fixture whose baseline check records its calls and answers <see cref="Answer"/>.</summary>
    private sealed class RecordingFixture : AppFixture
    {
        public List<string> Calls { get; } = [];
        public BaselineViolation Answer { get; init; }

        protected override Task<BaselineViolation> CheckBaselineAsync(string lastClass)
        {
            Calls.Add(lastClass);
            return Task.FromResult(Answer);
        }
    }

    /// <summary>Stands for the last test class that ran on the collection.</summary>
    private sealed class LastClassOfTheCollectionTests;

    private static async Task<RecordingFixture> StartedAsync(BaselineViolation answer)
    {
        var fixture = new RecordingFixture { Answer = answer };
        await fixture.InitializeAsync();
        await fixture.BeforeTestAsync(typeof(LastClassOfTheCollectionTests));
        return fixture;
    }

    private static async Task DropAsync(RecordingFixture fixture)
    {
        if (fixture.DatabaseName is not null && TestRun.Databases.Contains(fixture.DatabaseName))
            await TestRun.DropAsync(fixture.DatabaseName);
    }

    [Fact]
    [Trait("Case", "CAT-228")]
    public async Task The_dispose_calls_the_baseline_check_once_naming_the_last_class()
    {
        var fixture = await StartedAsync(answer: null);
        var before = fixture.Calls.Count;
        try
        {
            await fixture.DisposeAsync();

            fixture.Calls.Count.ShouldBe(before + 1, "the dispose checks once");
            fixture.Calls[^1].ShouldContain(nameof(LastClassOfTheCollectionTests));
        }
        finally
        {
            await DropAsync(fixture);
        }
    }

    [Fact]
    [Trait("Case", "CAT-228")]
    public async Task A_violation_found_by_the_dispose_is_reported_naming_the_last_class()
    {
        var violation = new BaselineViolation(nameof(LastClassOfTheCollectionTests),
            "tests never edit imported rows or categories: create your own shared drug or category (checksum differs)");
        var fixture = await StartedAsync(violation);
        var before = fixture.Calls.Count;
        try
        {
            var failure = await Should.ThrowAsync<Exception>(fixture.DisposeAsync);

            fixture.Calls.Count.ShouldBe(before + 1, "the dispose checks once");
            failure.ToString().ShouldContain(violation.Message);
            failure.ToString().ShouldContain(nameof(LastClassOfTheCollectionTests));
        }
        finally
        {
            await DropAsync(fixture);
        }
    }
}
