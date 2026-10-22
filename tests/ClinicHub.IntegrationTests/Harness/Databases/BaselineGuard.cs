namespace ClinicHub.IntegrationTests.Harness.Databases;

/// <summary>A change to the imported catalog found by <see cref="BaselineGuard"/>.</summary>
/// <param name="LastClass">The test class that ran just before the check (named in the failure).</param>
/// <param name="Message">
/// Starts with "tests never edit imported rows or categories: create your own shared drug or category" and says what
/// differs (the checksum, a max id, the shared count).
/// </param>
public sealed record BaselineViolation(string LastClass, string Message);

/// <summary>
/// The check of design M1.7 D12: after each reset (<c>AppFixture.ResetAsync</c>) and at the collection fixture's
/// dispose, the imported rows must still equal the run's <see cref="CatalogBaseline"/> (checksum, max ids, shared count).
/// A violation fails the run naming the class; the collection database is then re-created from the template. Harness
/// self-tests (CAT-225–CAT-227) call it on a scratch copy they changed, never on the run's own databases.
/// </summary>
public static class BaselineGuard
{
    /// <summary>
    /// Null when <paramref name="connectionString"/>'s database still holds <paramref name="baseline"/>; else the
    /// violation, naming <paramref name="lastClass"/>. M1.7b contract stub (track <c>harness</c>).
    /// </summary>
    public static Task<BaselineViolation> CheckAsync(string connectionString, CatalogBaseline baseline, string lastClass) =>
        throw new NotImplementedException("M1.7b contract stub: track harness");
}
