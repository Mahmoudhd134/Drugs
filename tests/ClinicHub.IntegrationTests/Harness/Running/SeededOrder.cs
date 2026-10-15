using System.Security.Cryptography;
using System.Text;
using Xunit.Abstractions;
using Xunit.Sdk;

namespace ClinicHub.IntegrationTests.Harness.Running;

/// <summary>
/// Random but repeatable order (design D10: tests must not depend on their order). With <c>CLINICHUB_TEST_SEED</c> set
/// (<c>test.ps1 -Seed n</c>, or any integer), the collections, the classes inside a collection and the tests inside a
/// class run in an order shuffled from that seed; the same seed gives the same order. Without it, xUnit's own order.
/// </summary>
public static class SeededOrder
{
    public const string SeedVariable = "CLINICHUB_TEST_SEED";

    public static int? Seed { get; } =
        int.TryParse(Environment.GetEnvironmentVariable(SeedVariable), out var seed) ? seed : null;

    /// <summary>A deterministic shuffle of <paramref name="items"/> for <paramref name="scope"/>; unchanged without a seed.</summary>
    public static List<T> Shuffle<T>(IEnumerable<T> items, Func<T, string> name, string scope)
    {
        var list = items.ToList();
        if (Seed is not { } seed)
            return list;
        // From a fixed base order, so the result depends only on the seed
        list = list.OrderBy(name, StringComparer.Ordinal).ToList();
        var random = new Random(seed ^ StableHash(scope));
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = random.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
        return list;
    }

    private static int StableHash(string value) =>
        BitConverter.ToInt32(SHA256.HashData(Encoding.UTF8.GetBytes(value ?? "")), 0);
}

/// <summary>Shuffles the tests of a class (<see cref="SeededOrder"/>).</summary>
public sealed class SeededTestCaseOrderer : ITestCaseOrderer
{
    public IEnumerable<TTestCase> OrderTestCases<TTestCase>(IEnumerable<TTestCase> testCases) where TTestCase : ITestCase
    {
        var list = testCases.ToList();
        var scope = list.FirstOrDefault()?.TestMethod.TestClass.Class.Name;
        return SeededOrder.Shuffle(list, t => t.UniqueID, scope);
    }
}

/// <summary>Shuffles the collections (<see cref="SeededOrder"/>).</summary>
public sealed class SeededCollectionOrderer : ITestCollectionOrderer
{
    public IEnumerable<ITestCollection> OrderTestCollections(IEnumerable<ITestCollection> testCollections) =>
        SeededOrder.Shuffle(testCollections, c => c.DisplayName, "collections");
}
