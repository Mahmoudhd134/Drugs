using System.Security.Cryptography;
using ClinicHub.IntegrationTests.Harness.Databases;
using Npgsql;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// Crash cleanup (design D3): a run that is gone (killed, crashed) leaves its databases behind; the next run drops
/// them, but never the databases of a run that is still alive (another worktree testing in parallel).
/// </summary>
[Trait("Area", "infra")]
public class StaleDatabaseTests
{
    private const string Admin = "Host=localhost;Port=5432;Database=postgres;Username=drags;Password=drags;Pooling=false";

    [Fact]
    public async Task The_databases_of_a_run_that_is_gone_are_dropped()
    {
        await TestRun.EnsureStartedAsync();
        var database = $"drags_it_{NewRunId("gone")}_1";
        await CreateAsync(database);

        var dropped = await TestRun.DropStaleAsync();

        dropped.ShouldContain(database);
        (await ExistsAsync(database)).ShouldBeFalse();
    }

    [Fact]
    public async Task The_databases_of_a_live_run_are_kept()
    {
        await TestRun.EnsureStartedAsync();
        var run = NewRunId("live");
        var database = $"drags_it_{run}_1";
        await using (var liveRun = new NpgsqlConnection(Admin))
        {
            await liveRun.OpenAsync();
            (await TestRun.TryLockAsync(liveRun, run)).ShouldBeTrue();
            await CreateAsync(database);

            (await TestRun.DropStaleAsync()).ShouldNotContain(database);
            (await ExistsAsync(database)).ShouldBeTrue();
        }

        // The run ends without cleaning up (its session is gone): the next cleanup drops it
        (await TestRun.DropStaleAsync()).ShouldContain(database);
    }

    [Fact]
    public async Task This_runs_own_databases_are_kept()
    {
        await TestRun.EnsureStartedAsync();

        var dropped = await TestRun.DropStaleAsync();

        dropped.ShouldNotContain(TestRun.TemplateName);
        (await ExistsAsync(TestRun.TemplateName)).ShouldBeTrue();
    }

    private static string NewRunId(string label) => $"selftest{label}{Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant()}";

    private static async Task CreateAsync(string database)
    {
        DatabaseGuard.EnsureName(database);
        await using var connection = new NpgsqlConnection(Admin);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", connection);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<bool> ExistsAsync(string database)
    {
        await using var connection = new NpgsqlConnection(Admin);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT count(*) FROM pg_database WHERE datname = @name", connection);
        command.Parameters.AddWithValue("name", database);
        return (long)await command.ExecuteScalarAsync() == 1;
    }
}
