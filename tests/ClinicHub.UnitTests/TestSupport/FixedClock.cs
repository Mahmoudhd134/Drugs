namespace ClinicHub.UnitTests.TestSupport;

/// <summary>A clock stopped at one instant (unit tests need no more than that).</summary>
public sealed class FixedClock(DateTimeOffset now) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => now;
}
