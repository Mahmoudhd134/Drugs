using System.Diagnostics;
using Npgsql;

namespace ClinicHub.IntegrationTests.Harness.Databases;

/// <summary>
/// Runs <c>data/drug-catalog/tools/load_catalog.py</c> on a run database (design M1.7 D11, D12): <c>python</c> started
/// directly with an argument list (no shell), so Rider, <c>dotnet test</c>, Stryker and <c>test.ps1</c> work the same.
/// Python 3 + psycopg are a test prerequisite (docs/testing/README.md); when missing, the run stops with
/// <see cref="InstallHint"/>.
/// </summary>
public static class CatalogLoader
{
    public const string InstallHint =
        "The integration tests load the shared drug catalog with Python 3 and psycopg: install Python 3.10+ (python on " +
        "the PATH), then run: python -m pip install \"psycopg[binary]\"";

    /// <summary>The script, found from the test assembly's folder upwards (the repository root holds <c>data/</c>).</summary>
    public static string ScriptPath
    {
        get
        {
            for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            {
                var script = Path.Combine(dir.FullName, "data", "drug-catalog", "tools", "load_catalog.py");
                if (File.Exists(script))
                    return script;
            }
            throw new InvalidOperationException("data/drug-catalog/tools/load_catalog.py not found above " + AppContext.BaseDirectory);
        }
    }

    /// <summary>The libpq conninfo of an Npgsql connection string (host, port, dbname, user, password).</summary>
    public static string ConnInfo(string connectionString)
    {
        var b = new NpgsqlConnectionStringBuilder(DatabaseGuard.Ensure(connectionString));
        return $"host={b.Host} port={b.Port} dbname={b.Database} user={b.Username} password={b.Password}";
    }

    /// <summary>How long one load may take (it takes a few seconds; a hung Python is killed and fails the run).</summary>
    public static readonly TimeSpan LoadTimeout = TimeSpan.FromMinutes(5);

    /// <summary>
    /// Loads the catalog into the (migrated, empty) database; throws with the script's output on failure, or with
    /// <see cref="InstallHint"/> when Python or psycopg is missing (also the Windows "python" app alias that only opens
    /// the Store: exit code 9009).
    /// </summary>
    public static async Task LoadAsync(string connectionString)
    {
        var start = new ProcessStartInfo("python")
        {
            RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false,
            StandardOutputEncoding = System.Text.Encoding.UTF8, StandardErrorEncoding = System.Text.Encoding.UTF8,
        };
        start.ArgumentList.Add(ScriptPath);
        start.ArgumentList.Add("--connection");
        start.ArgumentList.Add(ConnInfo(connectionString));
        // The script's own messages in UTF-8 whatever the console code page
        start.Environment["PYTHONIOENCODING"] = "utf-8";
        Process process;
        try
        {
            process = Process.Start(start) ?? throw new InvalidOperationException(InstallHint);
        }
        catch (System.ComponentModel.Win32Exception e)
        {
            throw new InvalidOperationException($"{InstallHint} ({e.Message})", e);
        }
        using (process)
        {
            var output = process.StandardOutput.ReadToEndAsync();
            var error = process.StandardError.ReadToEndAsync();
            using (var timeout = new CancellationTokenSource(LoadTimeout))
            {
                try
                {
                    await process.WaitForExitAsync(timeout.Token);
                }
                catch (OperationCanceledException)
                {
                    process.Kill(entireProcessTree: true);
                    throw new InvalidOperationException($"load_catalog.py did not finish within {LoadTimeout.TotalMinutes:0} minutes (killed).");
                }
            }
            var text = await error;
            if (process.ExitCode == 0)
            {
                TestRun.Log.Enqueue($"load_catalog.py: {(await output).Trim()}");
                return;
            }
            throw new InvalidOperationException(text.Contains("No module named 'psycopg'") || process.ExitCode == 9009
                ? InstallHint
                : $"load_catalog.py failed ({process.ExitCode}): {await output}{text}");
        }
    }
}
