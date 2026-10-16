using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Npgsql;

namespace ClinicHub.IntegrationTests.Harness.Databases;

/// <summary>
/// The databases of one test process (design D3): one template <c>drags_it_&lt;run&gt;_tpl</c>, migrated and seeded once
/// by booting the app on it, and one copy per collection (<see cref="CreateCopyAsync"/>). The run id comes from
/// <c>CLINICHUB_TEST_RUN</c> (set by <c>test.ps1</c>), else a generated one, so parallel worktrees never clash.
/// <para>
/// Liveness: the process holds a session advisory lock named after its run id (on the <c>postgres</c> database) for its
/// whole life. At start, every <c>drags_it_*</c> database whose run holds no lock (a crashed or killed run) is dropped,
/// and so is any older than <see cref="StaleAfter"/>. At the end (<see cref="ShutdownAsync"/>, called by
/// <see cref="Running.IntegrationTestFramework"/>) the run drops its own databases.
/// </para>
/// <para>
/// Under load (parallel worktrees, Stryker) a <c>CREATE</c>/<c>DROP DATABASE</c> can wait long for PostgreSQL's
/// checkpoints, so the maintenance connection has a long command timeout (<see cref="AdminCommandTimeoutSeconds"/>).
/// Only creating this run's databases fails loudly: dropping (other runs' leftovers, a collection's copy at its end,
/// the run's own at shutdown) is best effort, logged (<see cref="Warn"/>) and retried later (at shutdown, else by the
/// next run's stale cleanup, the run being gone), never a failed test. Opening a connection can also be slow then
/// (several runs, a build): every connection allows <see cref="ConnectTimeoutSeconds"/>, and an app that fails to
/// start on a connection failure is started again (<see cref="StartAppAsync"/>).
/// </para>
/// </summary>
public static class TestRun
{
    public const string RunIdVariable = "CLINICHUB_TEST_RUN";
    /// <summary>Optional: the server (no database) as a connection string; default the compose container.</summary>
    public const string ServerVariable = "CLINICHUB_TEST_PG";
    public static readonly TimeSpan StaleAfter = TimeSpan.FromDays(1);
    private const string DefaultServer = "Host=localhost;Port=5432;Username=drags;Password=drags";
    private const string CommentPrefix = "clinichub-it created=";
    /// <summary>CREATE/DROP DATABASE under load wait for checkpoints well past Npgsql's default 30 s.</summary>
    public const int AdminCommandTimeoutSeconds = 600;
    /// <summary>
    /// Opening a connection (TCP + authentication) under load: Npgsql's default 15 s timed out when a collection's app
    /// started while other runs and a build kept the machine busy.
    /// </summary>
    public const int ConnectTimeoutSeconds = 60;
    /// <summary>How many times a collection's (or the template's) app is started when its start fails on a connection.</summary>
    public const int AppStartAttempts = 3;

    public static string Id { get; } = ResolveId(Environment.GetEnvironmentVariable(RunIdVariable));
    public static string TemplateName => $"{DatabaseGuard.Prefix}{Id}_tpl";

    /// <summary>What the run did with databases (created, dropped, stale ones found): for the self-tests and debugging.</summary>
    public static ConcurrentQueue<string> Log { get; } = new();
    /// <summary>Problems that did not fail the run (a database not dropped yet), reported at the end of the run.</summary>
    public static ConcurrentQueue<string> Warnings { get; } = new();

    private static readonly object Sync = new();
    private static readonly SemaphoreSlim CreateGate = new(1, 1);
    private static readonly ConcurrentDictionary<string, byte> Created = new();
    private static Task started;
    private static NpgsqlConnection lockConnection;
    // Set only once this process holds the run's liveness lock: a refused duplicate run must not drop the live run's
    // databases on its way out
    private static bool ownsLock;
    private static int copies;

    /// <summary>The databases of this run that exist now (template and copies).</summary>
    public static IReadOnlyCollection<string> Databases => Created.Keys.ToList();

    /// <summary>A guarded connection string to one of the run's databases (pooled, at most 20 connections).</summary>
    public static string ConnectionString(string database) =>
        DatabaseGuard.Ensure(new NpgsqlConnectionStringBuilder(Server)
        {
            Database = database, MaxPoolSize = 20, Timeout = ConnectTimeoutSeconds,
        }.ConnectionString);

    private static string Server => Environment.GetEnvironmentVariable(ServerVariable) is { Length: > 0 } server ? server : DefaultServer;

    /// <summary>The maintenance database, unpooled: only CREATE / DROP / COMMENT and the liveness locks.</summary>
    internal static string AdminConnectionString
    {
        get
        {
            var builder = new NpgsqlConnectionStringBuilder(Server)
            {
                Database = "postgres", Pooling = false, CommandTimeout = AdminCommandTimeoutSeconds,
                Timeout = ConnectTimeoutSeconds,
            };
            DatabaseGuard.EnsureLocal(builder.Host);
            return builder.ConnectionString;
        }
    }

    /// <summary>Starts the run once per process: liveness lock, stale cleanup, the template.</summary>
    public static Task EnsureStartedAsync()
    {
        lock (Sync)
            return started ??= StartAsync();
    }

    private static async Task StartAsync()
    {
        lockConnection = new NpgsqlConnection(AdminConnectionString);
        await lockConnection.OpenAsync();
        if (!await TryLockAsync(lockConnection, Id))
            throw new InvalidOperationException(
                $"Another test process is running with the run id '{Id}' ({RunIdVariable}); use another id.");
        ownsLock = true;

        try
        {
            await DropStaleAsync();
        }
        catch (Exception e)
        {
            Warn($"stale database cleanup skipped: {e.Message}");
        }

        await CreateDatabaseAsync(TemplateName, template: null);
        // Booting the app migrates the database and runs the startup seeder (template clinic, test super admin),
        // exactly as on a real start
        var templateConnection = ConnectionString(TemplateName);
        await using (await StartAppAsync(() => new ClinicHubFactory(templateConnection), "the template's app"))
        {
        }
        // A template must have no open connection when it is copied
        NpgsqlConnection.ClearPool(new NpgsqlConnection(templateConnection));
        Log.Enqueue($"template {TemplateName} ready");
    }

    /// <summary>
    /// Creates and starts an app (migrations and startup seeder run); a start that fails on a connection failure (a
    /// connect timeout under load, a dropped connection) is retried with a new app, up to <see cref="AppStartAttempts"/>
    /// times, each retry reported (<paramref name="report"/>, default: a warning of the run). Any other startup failure
    /// throws at once.
    /// </summary>
    public static async Task<ClinicHubFactory> StartAppAsync(Func<ClinicHubFactory> create, string what,
        Action<string> report = null)
    {
        for (var attempt = 1; ; attempt++)
        {
            var factory = create();
            try
            {
                factory.Start();
                return factory;
            }
            catch (Exception e) when (attempt < AppStartAttempts && IsConnectionFailure(e))
            {
                (report ?? Warn)($"{what} did not start (attempt {attempt} of {AppStartAttempts}, started again): {e.GetBaseException().Message}");
                await factory.DisposeAsync();
                NpgsqlConnection.ClearPool(new NpgsqlConnection(factory.ConnectionString));
                await Task.Delay(TimeSpan.FromSeconds(attempt * 2));
            }
            catch
            {
                await factory.DisposeAsync();
                throw;
            }
        }
    }

    /// <summary>A failure to reach PostgreSQL (timeout, transient Npgsql error) anywhere in the exception chain.</summary>
    public static bool IsConnectionFailure(Exception exception)
    {
        var pending = new Stack<Exception>([exception]);
        while (pending.TryPop(out var e))
        {
            if (e is TimeoutException or NpgsqlException { IsTransient: true })
                return true;
            if (e is AggregateException aggregate)
                foreach (var inner in aggregate.InnerExceptions)
                    pending.Push(inner);
            else if (e.InnerException is not null)
                pending.Push(e.InnerException);
        }
        return false;
    }

    /// <summary>A new copy of the template for one collection: <c>drags_it_&lt;run&gt;_&lt;n&gt;</c>.</summary>
    public static async Task<string> CreateCopyAsync()
    {
        await EnsureStartedAsync();
        var name = $"{DatabaseGuard.Prefix}{Id}_{Interlocked.Increment(ref copies)}";
        await CreateDatabaseAsync(name, TemplateName);
        return name;
    }

    /// <summary>Drops one database of this run (a collection's copy, at its end).</summary>
    public static async Task DropAsync(string database)
    {
        NpgsqlConnection.ClearPool(new NpgsqlConnection(ConnectionString(database)));
        await using var connection = new NpgsqlConnection(AdminConnectionString);
        await connection.OpenAsync();
        await DropAsync(connection, database);
        Created.TryRemove(database, out _);
    }

    /// <summary>
    /// End of the process: drops every database of this run and releases the liveness lock; a later start in the same
    /// process (a test host kept alive) starts a new template. A process that never got the lock (a duplicate run id)
    /// drops nothing: those databases belong to the live run.
    /// </summary>
    public static async Task ShutdownAsync()
    {
        Task start;
        lock (Sync)
            start = started;
        if (start is null)
            return;
        try
        {
            await start;
        }
        catch
        {
            // A failed start still cleans up what it created
        }

        try
        {
            if (ownsLock)
            {
                NpgsqlConnection.ClearAllPools();
                await using var connection = new NpgsqlConnection(AdminConnectionString);
                await connection.OpenAsync();
                foreach (var database in await ListAsync(connection))
                    if (RunOf(database.Name) == Id)
                        await TryDropAsync(connection, database.Name, "left for the next run's cleanup");
            }
        }
        catch (Exception e)
        {
            Warn($"the run's databases were not dropped (the next run's cleanup will): {e.Message}");
        }
        finally
        {
            Created.Clear();
            if (lockConnection is not null)
                await lockConnection.DisposeAsync();
            lockConnection = null;
            ownsLock = false;
            lock (Sync)
                started = null;
        }
    }

    /// <summary>
    /// Drops the databases left by runs that are gone (their liveness lock is free: crashed, killed) or that are older
    /// than <see cref="StaleAfter"/>; a live run's databases are kept. Best effort: a database that can't be dropped now
    /// is logged and left for a later cleanup. Returns the dropped names.
    /// </summary>
    public static async Task<List<string>> DropStaleAsync()
    {
        var dropped = new List<string>();
        // Not while this run creates a database (it would not be in Created yet)
        await CreateGate.WaitAsync();
        try
        {
            await using var connection = new NpgsqlConnection(AdminConnectionString);
            await connection.OpenAsync();
            await DropStaleAsync(connection, dropped);
        }
        finally
        {
            CreateGate.Release();
        }
        return dropped;
    }

    private static async Task DropStaleAsync(NpgsqlConnection connection, List<string> dropped)
    {
        foreach (var run in (await ListAsync(connection)).GroupBy(d => RunOf(d.Name)))
        {
            if (run.Key is null)
                continue;
            // This process holds its own lock (taken before the cleanup): a database with its id is a leftover of a
            // previous, dead run with the same id
            var isOwn = run.Key == Id;
            bool alive;
            try
            {
                alive = !isOwn && !await TryLockAsync(connection, run.Key);
                if (!alive && !isOwn)
                    await UnlockAsync(connection, run.Key);
            }
            catch (Exception e)
            {
                Warn($"stale cleanup: could not check run {run.Key}: {e.Message}");
                continue;
            }
            foreach (var database in run)
            {
                var old = database.CreatedAt is { } created && DateTime.UtcNow - created > StaleAfter;
                if (alive && !old)
                    continue;
                if (isOwn && Created.ContainsKey(database.Name))
                    continue;
                if (!await TryDropAsync(connection, database.Name, "a later cleanup retries"))
                    continue;
                dropped.Add(database.Name);
                Log.Enqueue($"dropped stale {database.Name} ({(alive ? "older than a day" : "run gone")})");
            }
        }
    }

    /// <summary>The run id of a test database name (<c>drags_it_&lt;run&gt;_&lt;suffix&gt;</c>), null for any other name.</summary>
    public static string RunOf(string database) =>
        database is not null && DatabaseGuard.TestDatabaseName().IsMatch(database)
            ? database.Split('_')[2]
            : null;

    /// <summary>The run id from the environment, reduced to lowercase letters and digits; generated when empty.</summary>
    public static string ResolveId(string fromEnvironment)
    {
        var id = new string((fromEnvironment ?? "").ToLowerInvariant().Where(char.IsAsciiLetterOrDigit).ToArray());
        if (id.Length == 0)
            id = $"local{DateTime.UtcNow:yyyyMMddHHmmss}{Convert.ToHexString(RandomNumberGenerator.GetBytes(2)).ToLowerInvariant()}";
        // PostgreSQL names are at most 63 bytes: drags_it_ + id + _ + suffix
        return id.Length > 40 ? id[..40] : id;
    }

    /// <summary>Takes the run's liveness lock on <paramref name="connection"/> (true) unless another session holds it.</summary>
    public static async Task<bool> TryLockAsync(NpgsqlConnection connection, string runId)
    {
        await using var command = new NpgsqlCommand("SELECT pg_try_advisory_lock(@key)", connection);
        command.Parameters.AddWithValue("key", LockKey(runId));
        return (bool)await command.ExecuteScalarAsync();
    }

    private static async Task UnlockAsync(NpgsqlConnection connection, string runId)
    {
        await using var command = new NpgsqlCommand("SELECT pg_advisory_unlock(@key)", connection);
        command.Parameters.AddWithValue("key", LockKey(runId));
        await command.ExecuteScalarAsync();
    }

    private static long LockKey(string runId) =>
        BitConverter.ToInt64(SHA256.HashData(Encoding.UTF8.GetBytes($"clinichub-it:{runId}")), 0);

    private static async Task CreateDatabaseAsync(string name, string template)
    {
        DatabaseGuard.EnsureName(name);
        await CreateGate.WaitAsync();
        try
        {
            await using var connection = new NpgsqlConnection(AdminConnectionString);
            await connection.OpenAsync();
            var sql = template is null ? $"CREATE DATABASE \"{name}\"" : $"CREATE DATABASE \"{name}\" TEMPLATE \"{template}\"";
            for (var attempt = 1; ; attempt++)
            {
                try
                {
                    await Execute(connection, sql);
                    break;
                }
                // 55006: the template still has a session closing (a pooled connection just released)
                catch (PostgresException e) when (e.SqlState == "55006" && attempt < 20)
                {
                    await Task.Delay(100);
                }
            }
            Created[name] = 0;
            await Execute(connection, $"COMMENT ON DATABASE \"{name}\" IS '{CommentPrefix}{DateTime.UtcNow:O}'");
            Log.Enqueue($"created {name}");
        }
        finally
        {
            CreateGate.Release();
        }
    }

    /// <summary>A drop that never throws: false (and a warning) when the database could not be dropped now.</summary>
    private static async Task<bool> TryDropAsync(NpgsqlConnection connection, string name, string then)
    {
        // A name the guard refuses is a bug of the harness: that one throws
        DatabaseGuard.EnsureName(name);
        try
        {
            await DropAsync(connection, name);
            return true;
        }
        catch (Exception e)
        {
            Warn($"could not drop {name} ({then}): {e.Message}");
            return false;
        }
    }

    /// <summary>Logs a problem that does not fail the run; the test framework reports them at the end.</summary>
    public static void Warn(string message)
    {
        Warnings.Enqueue(message);
        Log.Enqueue($"warning: {message}");
    }

    private static async Task DropAsync(NpgsqlConnection connection, string name)
    {
        DatabaseGuard.EnsureName(name);
        await Execute(connection, $"DROP DATABASE IF EXISTS \"{name}\" WITH (FORCE)");
        Log.Enqueue($"dropped {name}");
    }

    private static async Task Execute(NpgsqlConnection connection, string sql)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        await command.ExecuteNonQueryAsync();
    }

    private sealed record TestDatabase(string Name, DateTime? CreatedAt);

    private static async Task<List<TestDatabase>> ListAsync(NpgsqlConnection connection)
    {
        await using var command = new NpgsqlCommand(
            @"SELECT datname, coalesce(shobj_description(oid, 'pg_database'), '') FROM pg_database
              WHERE datname LIKE 'drags\_it\_%'", connection);
        await using var reader = await command.ExecuteReaderAsync();
        var list = new List<TestDatabase>();
        while (await reader.ReadAsync())
        {
            var comment = reader.GetString(1);
            DateTime? createdAt = comment.StartsWith(CommentPrefix, StringComparison.Ordinal)
                && DateTime.TryParse(comment[CommentPrefix.Length..], null, System.Globalization.DateTimeStyles.RoundtripKind,
                    out var created)
                    ? created.ToUniversalTime()
                    : null;
            list.Add(new TestDatabase(reader.GetString(0), createdAt));
        }
        return list;
    }
}
