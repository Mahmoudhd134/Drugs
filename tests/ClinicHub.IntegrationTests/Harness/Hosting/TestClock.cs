namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// The app's <see cref="TimeProvider"/> in tests: the real time plus an offset that tests move forward with
/// <see cref="Advance"/> (never a sleep). Reset to the real time before every test (<see cref="AppFixture"/>).
/// <para>
/// Why not a frozen <c>FakeTimeProvider</c>: the app stamps <c>CreatedAt</c>/<c>UpdatedAt</c> with
/// <c>DateTime.UtcNow</c> (save interceptor) and JwtBearer checks token lifetimes with the real clock, while the use
/// cases compare those stamps with <see cref="TimeProvider"/>. A frozen clock lags behind the stamps by however long
/// the test has run, so "60 s after the last code" would give <c>Retry-After: 61</c>. Real time + offset keeps both
/// clocks together, so "advance 60 s" means 60 s for every comparison.
/// </para>
/// </summary>
public sealed class TestClock : TimeProvider
{
    private long offsetTicks;

    public TimeSpan Offset => TimeSpan.FromTicks(Interlocked.Read(ref offsetTicks));

    public override DateTimeOffset GetUtcNow() => System.GetUtcNow() + Offset;

    /// <summary>Moves the app's time forward (only forward: the app never sees time go back inside a test).</summary>
    public void Advance(TimeSpan by)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(by, TimeSpan.Zero);
        Interlocked.Add(ref offsetTicks, by.Ticks);
    }

    /// <summary>Back to the real time (between tests).</summary>
    public void Reset() => Interlocked.Exchange(ref offsetTicks, 0);
}
