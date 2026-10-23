using System.Text.RegularExpressions;
using Npgsql;

namespace ClinicHub.IntegrationTests.Harness.Databases;

/// <summary>
/// The one safety check between the tests and a real database: a test host or a cleanup only ever touches a database
/// named <c>drags_it_…</c> on the local compose server. Never <c>drags</c> (the developer's data), never another host.
/// </summary>
public static partial class DatabaseGuard
{
    public const string Prefix = "drags_it_";

    /// <summary>
    /// A run's database: <c>drags_it_&lt;run&gt;_&lt;suffix&gt;</c> (letters and digits only between the underscores), or
    /// the run's bare template <c>drags_it_&lt;run&gt;_tpl_bare</c> (design M1.7 D12).
    /// </summary>
    [GeneratedRegex("^drags_it_[a-z0-9]+_[a-z0-9]+(?:_bare)?$")]
    public static partial Regex TestDatabaseName();

    private static readonly string[] LocalHosts = ["localhost", "127.0.0.1", "::1"];

    /// <summary>Throws unless <paramref name="connectionString"/> points to a test database on the local server; returns it.</summary>
    public static string Ensure(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
            throw new InvalidOperationException("Test database guard: no connection string.");
        var builder = new NpgsqlConnectionStringBuilder(connectionString);
        EnsureName(builder.Database);
        EnsureLocal(builder.Host);
        return connectionString;
    }

    /// <summary>Throws unless <paramref name="database"/> is a test database name (<see cref="TestDatabaseName"/>).</summary>
    public static void EnsureName(string database)
    {
        if (database is null || !TestDatabaseName().IsMatch(database))
            throw new InvalidOperationException(
                $"Test database guard: refusing database '{database}': tests only use databases named {Prefix}<run>_<n> (or {Prefix}<run>_tpl_bare).");
    }

    /// <summary>Throws unless <paramref name="host"/> is the local (compose) server.</summary>
    public static void EnsureLocal(string host)
    {
        if (host is null || !LocalHosts.Contains(host.Trim(), StringComparer.OrdinalIgnoreCase))
            throw new InvalidOperationException(
                $"Test database guard: refusing host '{host}': tests only use the local compose PostgreSQL.");
    }
}
