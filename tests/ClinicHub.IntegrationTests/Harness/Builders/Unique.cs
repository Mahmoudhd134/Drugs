namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary>Values that never repeat inside a test process (each collection has its own database anyway).</summary>
public static class Unique
{
    private static int counter;

    public static int Next() => Interlocked.Increment(ref counter);

    /// <summary>A valid Egyptian mobile in E.164 (<c>+2011…</c>, 8 more digits), never the test super admin's.</summary>
    public static string Phone() => $"+2011{10_000_000 + Next():D8}";

    /// <summary>The same number in the local form typed on the login page (<c>011…</c>).</summary>
    public static string LocalPhone(string e164) => "0" + e164[3..];

    /// <summary>A name with both scripts, e.g. <c>Clinic 12 عيادة</c>: unique, and Arabic-safe like real data.</summary>
    public static string Name(string english, string arabic) => $"{english} {Next()} {arabic}";
}
