namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// The app's <see cref="TimeProvider"/> in tests: a <b>frozen</b> wall clock. <see cref="Reset"/> (before every test,
/// <see cref="AppFixture"/>) sets it to the real time (whole seconds); after that it only moves when a test calls
/// <see cref="Advance"/> (never a sleep). Everything the app dates follows it: <c>CreatedAt</c>/<c>UpdatedAt</c> (save
/// interceptor), OTP expiry and limits, sessions, refresh grace, clinic delete, token <c>iat</c>/<c>nbf</c>/<c>exp</c>
/// and their check by JwtBearer (<see cref="ClinicHubFactory"/>). So "advance 60 s" is exactly 60 s for every
/// comparison, and an exact boundary (<c>&gt;</c> against <c>&gt;=</c>) is testable.
/// <para>
/// Timers and elapsed-time measures (<see cref="TimeProvider.GetTimestamp"/>, <see cref="TimeProvider.CreateTimer"/>)
/// stay real: nothing in the app waits on the test clock. The in-memory cache's own expiry (30 s) is real time too.
/// </para>
/// </summary>
public sealed class TestClock : TimeProvider
{
    private readonly object sync = new();
    private DateTimeOffset start;
    private DateTimeOffset now;

    public TestClock() => Reset();

    /// <summary>How far the clock was moved since the last <see cref="Reset"/>.</summary>
    public TimeSpan Offset
    {
        get
        {
            lock (sync)
                return now - start;
        }
    }

    public override DateTimeOffset GetUtcNow()
    {
        lock (sync)
            return now;
    }

    /// <summary>Moves the app's time forward (only forward: the app never sees time go back inside a test).</summary>
    public void Advance(TimeSpan by)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(by, TimeSpan.Zero);
        lock (sync)
            now += by;
    }

    /// <summary>
    /// Back to the real time, frozen there (between tests). Whole seconds: a stamp read back from PostgreSQL
    /// (microseconds) and a token time (<c>iat</c>/<c>exp</c>, seconds) then equal the clock exactly.
    /// </summary>
    public void Reset()
    {
        var real = System.GetUtcNow();
        lock (sync)
            start = now = new DateTimeOffset(real.Ticks - real.Ticks % TimeSpan.TicksPerSecond, TimeSpan.Zero);
    }
}
