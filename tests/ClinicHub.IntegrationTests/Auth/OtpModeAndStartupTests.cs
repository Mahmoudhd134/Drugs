using System.Collections.Concurrent;
using System.Net;
using ClinicHub.Application.Features.Identity.Login.Queries.GetOtpMode;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Shouldly;

namespace ClinicHub.IntegrationTests.Auth;

/// <summary>The OTP mode endpoint and the startup configuration checks (a variant app is a restart with other settings).</summary>
[Collection(AuthCollection.Name)]
[Trait("Area", "auth")]
public class OtpModeAndStartupTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "AUTH-001")]
    public async Task The_otp_mode_is_Display_without_a_token()
    {
        var response = await Anonymous().GetAsync("/api/v1/auth/otp/mode");

        await response.ShouldBeOkAsync();
        (await response.ReadAsync<OtpModeResponse>()).Mode.ShouldBe("Display");
        (await response.ReadNodeAsync())!["mode"]!.GetValue<string>().ShouldBe("Display");
    }

    [Theory]
    [Trait("Case", "AUTH-005")]
    [InlineData("Sms")]
    [InlineData("sms")]
    public void Startup_is_refused_in_Sms_mode(string mode)
    {
        using var variant = App.CreateVariant(new Dictionary<string, string> { ["Otp:Mode"] = mode });

        Should.Throw<InvalidOperationException>(variant.Start).Message.ShouldContain("Otp:Mode");
    }

    [Fact]
    [Trait("Case", "AUTH-006")]
    public async Task Display_mode_outside_Development_starts_and_logs_a_warning()
    {
        var logs = new CapturingLoggerProvider();
        await using var variant = App.CreateVariant(services: services => services.AddSingleton<ILoggerProvider>(logs));

        variant.Start();

        variant.Services.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>().EnvironmentName.ShouldBe("Testing");
        logs.Entries.ShouldContain(e => e.Level == LogLevel.Warning && e.Message.Contains("Display", StringComparison.OrdinalIgnoreCase),
            string.Join(Environment.NewLine, logs.Entries.Select(e => $"{e.Level}: {e.Message}")));
        await (await new Harness.Clients.ApiClient(variant).GetAsync("/api/v1/auth/otp/mode")).ShouldBeOkAsync();
    }

    public static TheoryData<string, string, string> BadKeys => new()
    {
        { "Auth:Jwt:SigningKey", new string('k', 31), "Auth:Jwt:SigningKey" },
        { "Auth:Jwt:SigningKey", "", "Auth:Jwt:SigningKey" },
        { "Otp:HashKey", new string('h', 31), "Otp:HashKey" },
        { "Otp:HashKey", "", "Otp:HashKey" },
        { "Auth:Jwt:Issuer", "", "Issuer" },
        { "Auth:Jwt:Audience", "", "Audience" },
    };

    [Theory]
    [Trait("Case", "AUTH-007")]
    [MemberData(nameof(BadKeys))]
    public void Startup_is_refused_with_a_short_key_or_no_issuer_or_audience(string key, string value, string named)
    {
        using var variant = App.CreateVariant(new Dictionary<string, string> { [key] = value });

        Should.Throw<InvalidOperationException>(variant.Start).Message.ShouldContain(named);
    }

    [Fact]
    [Trait("Case", "AUTH-007")]
    public void A_key_of_exactly_32_bytes_is_accepted()
    {
        using var variant = App.CreateVariant(new Dictionary<string, string>
        {
            ["Auth:Jwt:SigningKey"] = new string('k', 32),
            ["Otp:HashKey"] = new string('h', 32),
        });

        Should.NotThrow(variant.Start);
    }

    [Theory]
    [Trait("Case", "AUTH-008")]
    [InlineData("12")]
    [InlineData("not a phone")]
    public void Startup_fails_naming_the_setting_for_an_invalid_super_admin_phone(string phone)
    {
        using var variant = App.CreateVariant(new Dictionary<string, string> { ["Platform:SuperAdminPhones:0"] = phone });

        Should.Throw<Exception>(variant.Start).ToString().ShouldContain("Platform:SuperAdminPhones");
    }

    [Theory]
    [Trait("Case", "AUTH-009")]
    [InlineData("Otp:Length", "3")]
    [InlineData("Otp:Length", "10")]
    [InlineData("Otp:MaxAttempts", "0")]
    [InlineData("Otp:ExpiryMinutes", "0")]
    [InlineData("Otp:MaxPerPhonePerHour", "0")]
    [InlineData("Otp:ResendSeconds", "-1")]
    [InlineData("Auth:AccessTokenMinutes", "0")]
    [InlineData("Auth:RefreshTokenDays", "0")]
    [InlineData("Auth:PlatformSessionHours", "0")]
    public void Startup_is_refused_with_out_of_range_numbers(string key, string value)
    {
        using var variant = App.CreateVariant(new Dictionary<string, string> { [key] = value });

        Should.Throw<InvalidOperationException>(variant.Start).Message.ShouldContain(key.Split(':')[0]);
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        public ConcurrentQueue<(LogLevel Level, string Message)> Entries { get; } = new();

        public ILogger CreateLogger(string categoryName) => new Logger(this);

        public void Dispose()
        {
        }

        private sealed class Logger(CapturingLoggerProvider provider) : ILogger
        {
            public IDisposable BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception exception,
                Func<TState, Exception, string> formatter) =>
                provider.Entries.Enqueue((logLevel, formatter(state, exception)));
        }
    }
}
