using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Catalog.Categories;
using ClinicHub.Application.Features.Catalog.Drugs;
using ClinicHub.Domain.Catalog;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;
using Xunit.Abstractions;

namespace ClinicHub.IntegrationTests.Catalog.Tree;

/// <summary>
/// The performance measure of the tree and the list (design M1.7 D7; M1.7c contract § 1.2): budget &lt; 100 ms per
/// request, warm, median of 20 requests on the dev machine. It <b>reports and never fails on time</b>: it writes
/// <c>artifacts/performance/m1.7c-tree.md</c> (route, query, median, p90, max in ms) for <c>GET /drugs/tree</c> and
/// <c>GET /drugs</c> with no search, "a" and «ا» (the list on page 1 and on its last page), on the imported catalog
/// (CAT-093) and on a clinic with 5,000 own drugs added (CAT-094). A budget miss goes to the orchestrator (D7: the fix is
/// decided with the user). It fails only when a request doesn't answer 200 (a measure of errors means nothing).
/// </summary>
[Collection(CatalogTreePerformanceCollection.Name)]
[Trait("Area", "catalog")]
public class TreePerformanceTests(AppFixture app, ITestOutputHelper output) : TreeTest(app)
{
    private const int Warmup = 3;
    private const int Timed = 20;
    private const double BudgetMs = 100;
    private const int OwnDrugs = 5_000;

    private sealed record Measure(string Route, string Query, HttpStatusCode Status, double Median, double P90, double Max);

    [Fact]
    [Trait("Case", "CAT-093")]
    [Trait("Case", "CAT-094")]
    public async Task The_tree_and_the_list_are_measured_warm_on_the_catalog_and_with_5000_own_drugs_and_reported()
    {
        var (_, catalogOwner) = await EmptyClinicAsync();
        var catalog = await MeasureAllAsync(catalogOwner);

        var (bigClinic, bigOwner) = await EmptyClinicAsync();
        await AddOwnDrugsAsync(bigClinic.Id, OwnDrugs);
        (await ListDrugsAsync(bigOwner, "source=own&pageSize=1")).TotalCount.ShouldBe(OwnDrugs, "the 5,000 own drugs were saved");
        var withOwn = await MeasureAllAsync(bigOwner);

        var path = WriteReport(catalog, withOwn);
        output.WriteLine($"Performance report: {path}");
        foreach (var measure in catalog.Concat(withOwn))
            output.WriteLine($"{measure.Route} {measure.Query}: {(int)measure.Status} median {measure.Median:F1} ms, p90 {measure.P90:F1}, max {measure.Max:F1}");

        catalog.Concat(withOwn).Where(m => m.Status != HttpStatusCode.OK).Select(m => $"{m.Route}?{m.Query} → {(int)m.Status}")
            .ShouldBeEmpty("every measured request answers 200 (the time itself is reported, never gated)");
    }

    /// <summary>The requests of contract § 1.2, each warm (3 untimed first), then 20 timed.</summary>
    private static async Task<List<Measure>> MeasureAllAsync(ApiClient client)
    {
        var measures = new List<Measure>();
        foreach (var search in new[] { "", "a", "ا" })
        {
            var term = search == "" ? "" : $"search={Uri.EscapeDataString(search)}";
            measures.Add(await MeasureAsync(client, "GET /drugs/tree", term, term == "" ? TreeUrl : $"{TreeUrl}?{term}"));

            var first = await client.GetAsync(term == "" ? DrugsUrl : $"{DrugsUrl}?{term}");
            var lastPage = 1;
            if (first.StatusCode == HttpStatusCode.OK)
            {
                var page = await first.ReadAsync<PagedResult<DrugDto>>();
                lastPage = Math.Max(1, (page.TotalCount + page.PageSize - 1) / page.PageSize);
            }
            var pageOne = term == "" ? "page=1" : $"{term}&page=1";
            var pageLast = term == "" ? $"page={lastPage}" : $"{term}&page={lastPage}";
            measures.Add(await MeasureAsync(client, "GET /drugs", pageOne, $"{DrugsUrl}?{pageOne}"));
            measures.Add(await MeasureAsync(client, "GET /drugs", pageLast, $"{DrugsUrl}?{pageLast}"));
        }
        return measures;
    }

    private static async Task<Measure> MeasureAsync(ApiClient client, string route, string query, string url)
    {
        var status = HttpStatusCode.OK;
        for (var i = 0; i < Warmup; i++)
            await (await client.GetAsync(url)).Content.ReadAsByteArrayAsync();
        var times = new List<double>();
        for (var i = 0; i < Timed; i++)
        {
            var watch = Stopwatch.StartNew();
            var response = await client.GetAsync(url);
            await response.Content.ReadAsByteArrayAsync();
            watch.Stop();
            times.Add(watch.Elapsed.TotalMilliseconds);
            if (response.StatusCode != HttpStatusCode.OK)
                status = response.StatusCode;
        }
        times.Sort();
        var median = (times[Timed / 2 - 1] + times[Timed / 2]) / 2;
        var p90 = times[(int)Math.Ceiling(0.9 * Timed) - 1];
        return new Measure(route, query == "" ? "(no search)" : Uri.UnescapeDataString(query), status, median, p90, times[^1]);
    }

    /// <summary>
    /// <paramref name="count"/> own drugs saved through the app's <see cref="AppDbContext"/> in the clinic's scope, so the
    /// save interceptor stamps them and fills their search columns (contract § 1.2); spread over a subcategory, a
    /// bucket and «أخرى › غير مصنف», with ingredients.
    /// </summary>
    private async Task AddOwnDrugsAsync(int clinicId, int count)
    {
        await using var scope = App.Factory.Services.CreateAsyncScope();
        using var _ = scope.ServiceProvider.GetRequiredService<IClinicScope>().Use(clinicId);
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var places = new (int Category, int? Sub)[]
        {
            (CategoryIds.Eye, SubCategoryIds.Glaucoma), (CategoryIds.Eye, null), (CategoryIds.Other, SubCategoryIds.Unclassified),
        };
        var run = Unique.Next();
        db.Drugs.AddRange(Enumerable.Range(1, count).Select(i => new Drug
        {
            ClinicId = clinicId,
            Name = $"Perf {run} own drug {i:D4} eye drops",
            ActiveIngredients = i % 2 == 0 ? $"TIMOLOL MALEATE {i}" : null,
            CategoryId = places[i % places.Length].Category,
            SubCategoryId = places[i % places.Length].Sub,
        }));
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        (await db.Drugs.IgnoreQueryFilters().CountAsync(d => d.ClinicId == clinicId)).ShouldBe(count);
    }

    /// <summary>Writes <c>artifacts/performance/m1.7c-tree.md</c> at the repository root; answers its path.</summary>
    private static string WriteReport(List<Measure> catalog, List<Measure> withOwn)
    {
        var root = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(CatalogLoader.ScriptPath)!, "..", "..", ".."));
        var folder = Path.Combine(root, "artifacts", "performance");
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "m1.7c-tree.md");
        var text = new StringBuilder()
            .AppendLine("# M1.7c tree and list performance (CAT-093, CAT-094)")
            .AppendLine()
            .AppendLine(string.Create(CultureInfo.InvariantCulture,
                $"Measured {DateTime.UtcNow:yyyy-MM-dd HH:mm} UTC by `tests/ClinicHub.IntegrationTests/Catalog/Tree/TreePerformanceTests` on `{Environment.MachineName}`: each request {Warmup} times untimed (warm), then {Timed} timed; in-memory test server, the compose PostgreSQL; other test collections may run at the same time. Budget (design M1.7 D7): < {BudgetMs:F0} ms median per request. Reported, never gated: a miss goes to the orchestrator."))
            .AppendLine();
        Section(text, $"Imported catalog (CAT-093): {TestRun.Baseline.SharedCount:N0} shared drugs, a clinic without own drugs", catalog);
        Section(text, $"Imported catalog + {OwnDrugs:N0} own drugs of the clinic (CAT-094)", withOwn);
        File.WriteAllText(path, text.ToString(), new UTF8Encoding(false));
        return path;
    }

    private static void Section(StringBuilder text, string title, List<Measure> measures)
    {
        text.AppendLine(CultureInfo.InvariantCulture, $"## {title}").AppendLine()
            .AppendLine("| Route | Query | Status | Median ms | p90 ms | Max ms | Median < 100 ms |")
            .AppendLine("|---|---|---:|---:|---:|---:|---|");
        foreach (var m in measures)
            text.AppendLine(CultureInfo.InvariantCulture,
                $"| `{m.Route}` | `{m.Query}` | {(int)m.Status} | {m.Median:F1} | {m.P90:F1} | {m.Max:F1} | {(m.Status != HttpStatusCode.OK ? "n/a" : m.Median < BudgetMs ? "yes" : "**no**")} |");
        text.AppendLine();
    }
}
