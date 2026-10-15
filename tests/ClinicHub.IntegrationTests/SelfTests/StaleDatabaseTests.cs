using System.Security.Cryptography;
using ClinicHub.IntegrationTests.Harness.Databases;
using Npgsql;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>
/// Crash cleanup (design D3): a run that is gone (killed, crashed) leaves its databases behind; the next run drops
/// them, but never the databases of a run that is still alive (another worktree testing in parallel).
/// <para>
/// Other test processes may run at the same time (parallel worktrees) and clean up too, so these tests check the
/// outcome (the database is gone, or still there), never which process dropped it.
/// </para>
/// </summary>
[Trait("Area", "infra")]
public class StaleDatabaseTests
{
    [Fact]
    public async Task The_databases_of_a_run_that_is_gone_are_dropped()
    {
        await TestRun.EnsureStartedAsync();
        var database = $"drags_it_{NewRunId("gone")}_1";
        try
        {
            await CreateAsync(database);

            await ShouldBeDroppedByTheCleanupAsync(database);
        }
        finally
        {
            await DropIfLeftAsync(database);
        }
    }

    [Fact]
    public async Task The_databases_of_a_live_run_are_kept()
    {
        await TestRun.EnsureStartedAsync();
        var run = NewRunId("live");
        var database = $"drags_it_{run}_1";
        try
        {
            await using (var liveRun = new NpgsqlConnection(TestRun.AdminConnectionString))
            {
                await liveRun.OpenAsync();
                (await TestRun.TryLockAsync(liveRun, run)).ShouldBeTrue();
                await CreateAsync(database);

                await TestRun.DropStaleAsync();

                (await ExistsAsync(database)).ShouldBeTrue();
            }

            // The run ends without cleaning up (its session is gone): the next cleanup drops it
            await ShouldBeDroppedByTheCleanupAsync(database);
        }
        finally
        {
            await DropIfLeftAsync(database);
        }
    }

    [Fact]
    public async Task This_runs_own_databases_are_kept()
    {
        await TestRun.EnsureStartedAsync();

        await TestRun.DropStaleAsync();

        (await ExistsAsync(TestRun.TemplateName)).ShouldBeTrue();
    }

    /// <summary>
    /// Runs the cleanup until the database is gone (at most 5 s): another process's cleanup may hold the dead run's lock
    /// for an instant while it drops the database itself, so one pass of ours may see the run as alive.
    /// </summary>
    private static async Task ShouldBeDroppedByTheCleanupAsync(string database)
    {
        for (var attempt = 0; attempt < 50; attempt++)
        {
            await TestRun.DropStaleAsync();
            if (!await ExistsAsync(database))
                return;
            await Task.Delay(100);
        }
        (await ExistsAsync(database)).ShouldBeFalse($"{database} should have been dropped by the cleanup");
    }

    private static string NewRunId(string label) => $"selftest{label}{Convert.ToHexString(RandomNumberGenerator.GetBytes(4)).ToLowerInvariant()}";

    private static async Task CreateAsync(string database)
    {
        DatabaseGuard.EnsureName(database);
        await ExecuteAsync($"CREATE DATABASE \"{database}\"");
    }

    private static async Task DropIfLeftAsync(string database)
    {
        DatabaseGuard.EnsureName(database);
        await ExecuteAsync($"DROP DATABASE IF EXISTS \"{database}\" WITH (FORCE)");
    }

    private static async Task ExecuteAsync(string sql)
    {
        await using var connection = new NpgsqlConnection(TestRun.AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private static async Task<bool> ExistsAsync(string database)
    {
        await using var connection = new NpgsqlConnection(TestRun.AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT count(*) FROM pg_database WHERE datname = @name", connection);
        command.Parameters.AddWithValue("name", database);
        return (long)await command.ExecuteScalarAsync() == 1;
    }
}
