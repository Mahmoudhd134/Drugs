using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace ClinicHub.IntegrationTests.Harness.Hosting;

/// <summary>
/// A logger provider that keeps every message of a variant app (<see cref="AppFixture.CreateVariant"/>), for the tests
/// of a documented log line (e.g. the dev seed's warnings). Register it with <see cref="Register"/> and raise the
/// category's level with <see cref="LevelSetting"/> (the Testing settings log warnings and above only).
/// </summary>
public sealed class CapturedLogs : ILoggerProvider
{
    private readonly ConcurrentQueue<Entry> entries = new();

    public sealed record Entry(string Category, LogLevel Level, string Message);

    /// <summary>The setting that logs <typeparamref name="T"/>'s category from <c>Information</c> on.</summary>
    public static KeyValuePair<string, string> LevelSetting<T>() => new($"Logging:LogLevel:{typeof(T).FullName}", "Information");

    public void Register(IServiceCollection services) => services.AddSingleton<ILoggerProvider>(this);

    /// <summary>The messages logged by <typeparamref name="T"/> at <paramref name="level"/>, in order.</summary>
    public List<string> Of<T>(LogLevel level) =>
        entries.Where(e => e.Category == typeof(T).FullName && e.Level == level).Select(e => e.Message).ToList();

    public void Clear() => entries.Clear();

    public ILogger CreateLogger(string categoryName) => new Logger(entries, categoryName);

    public void Dispose()
    {
    }

    private sealed class Logger(ConcurrentQueue<Entry> entries, string category) : ILogger
    {
        public IDisposable BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => logLevel != LogLevel.None;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception,
            Func<TState, Exception, string> formatter) =>
            entries.Enqueue(new Entry(category, logLevel, formatter(state, exception)));
    }
}
