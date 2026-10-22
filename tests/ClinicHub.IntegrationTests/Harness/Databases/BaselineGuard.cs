using Npgsql;

namespace ClinicHub.IntegrationTests.Harness.Databases;

/// <summary>A change to the imported catalog found by <see cref="BaselineGuard"/>.</summary>
/// <param name="LastClass">The test class that ran just before the check (named in the failure).</param>
/// <param name="Message">
/// Starts with "tests never edit imported rows or categories: create your own shared drug or category" and says what
/// differs (the checksum, a max id, the shared count).
/// </param>
public sealed record BaselineViolation(string LastClass, string Message);

/// <summary>
/// Fails the run on a <see cref="BaselineViolation"/> (thrown by the collection fixture's reset and dispose). Its message
/// is the violation's, followed by the last class when the violation's message doesn't already name it (design D12).
/// </summary>
public sealed class BaselineViolationException(BaselineViolation violation) : Exception(MessageOf(violation))
{
    public BaselineViolation Violation { get; } = violation;

    private static string MessageOf(BaselineViolation violation)
    {
        ArgumentNullException.ThrowIfNull(violation);
        var lastClass = violation.LastClass ?? "(none)";
        return violation.Message.Contains(lastClass, StringComparison.Ordinal)
            ? violation.Message
            : $"{violation.Message} (last class: {lastClass})";
    }
}

/// <summary>
/// The check of design M1.7 D12: after each reset (<c>AppFixture.ResetAsync</c>) and at the collection fixture's
/// dispose, the imported rows must still equal the run's <see cref="CatalogBaseline"/> (checksum, max ids, shared count).
/// A violation fails the run naming the class; the collection database is then re-created from the template. Harness
/// self-tests (CAT-225–CAT-227) call it on a scratch copy they changed, never on the run's own databases.
/// </summary>
public static class BaselineGuard
{
    public const string Rule = "tests never edit imported rows or categories: create your own shared drug or category";

    /// <summary>
    /// Null when <paramref name="connectionString"/>'s database still holds <paramref name="baseline"/>; else the
    /// violation, naming <paramref name="lastClass"/>. Rows created by tests (ids above the baseline's, own drugs) are
    /// not part of the check.
    /// </summary>
    public static async Task<BaselineViolation> CheckAsync(string connectionString, CatalogBaseline baseline, string lastClass)
    {
        ArgumentNullException.ThrowIfNull(baseline);
        await using var connection = new NpgsqlConnection(DatabaseGuard.Ensure(connectionString));
        await connection.OpenAsync();
        var now = await CatalogBaseline.ReadNumbersAsync(connection, baseline);
        var checksum = await CatalogBaseline.ChecksumAsync(connection, baseline.MaxDrugId, baseline.MaxCategoryId,
            baseline.MaxSubCategoryId);

        var differences = new List<string>();
        if (now.Shared != baseline.SharedCount)
            differences.Add($"imported shared drugs {now.Shared} (baseline {baseline.SharedCount})");
        if (now.MaxDrug != baseline.MaxDrugId)
            differences.Add($"max imported drug id {now.MaxDrug} (baseline {baseline.MaxDrugId})");
        if (now.MaxCategory != baseline.MaxCategoryId)
            differences.Add($"max imported category id {now.MaxCategory} (baseline {baseline.MaxCategoryId})");
        if (now.MaxSubCategory != baseline.MaxSubCategoryId)
            differences.Add($"max imported subcategory id {now.MaxSubCategory} (baseline {baseline.MaxSubCategoryId})");
        if (checksum != baseline.Checksum)
            differences.Add($"checksum {checksum} (baseline {baseline.Checksum})");
        if (differences.Count == 0)
            return null;

        var database = new NpgsqlConnectionStringBuilder(connectionString).Database;
        return new BaselineViolation(lastClass,
            $"{Rule}. The imported catalog of {database} changed after the test class {lastClass ?? "(none)"}: " +
            string.Join("; ", differences) + ".");
    }
}
