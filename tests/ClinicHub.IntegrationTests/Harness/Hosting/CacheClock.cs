namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// The access cache's clock (HybridCache dates its entries and its tag invalidations with it; an entry dated at or
/// before an invalidation of one of its tags is refused). It is the real time plus the app clock's advance
/// (<see cref="TestClock.Offset"/>), and it never goes back and never returns the same instant twice:
/// <list type="bullet">
/// <item>an answer cached after an invalidation is always later than it, as in production (with the frozen app clock,
/// the answer cached right after a login carried the login's own instant and was never kept);</item>
/// <item>after <see cref="TestClock.Reset"/> (the app clock back to the real time) it stays where it was, so a tag
/// invalidated an hour ahead in a previous test does not refuse every later entry.</item>
/// </list>
/// The in-memory cache's own 30 s expiry stays real time (<c>MemoryCache</c>'s clock).
/// </summary>
public sealed class CacheClock(TestClock app) : TimeProvider
{
    private readonly object sync = new();
    private DateTimeOffset last = DateTimeOffset.MinValue;

    public override DateTimeOffset GetUtcNow()
    {
        var candidate = System.GetUtcNow() + app.Offset;
        lock (sync)
            return last = candidate > last ? candidate : last.AddTicks(1);
    }
}
