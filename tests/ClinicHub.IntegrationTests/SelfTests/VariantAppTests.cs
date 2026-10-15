using System.Net;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Login;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.Infrastructure.Database;
using ClinicHub.IntegrationTests.Harness.Builders;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Databases;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Shouldly;

namespace ClinicHub.IntegrationTests.SelfTests;

/// <summary>A test can start another app on its collection's database with other settings or services.</summary>
[Collection(InfraCollectionA.Name)]
[Trait("Area", "infra")]
public class VariantAppTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public void The_Testing_settings_are_the_intended_ones()
    {
        var otp = App.Factory.Services.GetRequiredService<OtpSettings>();
        otp.Mode.ShouldBe(OtpModes.Display);
        otp.MaxAttempts.ShouldBe(5);
        otp.ResendSeconds.ShouldBe(60);
        otp.MaxPerPhonePerHour.ShouldBe(5);
        otp.ExpiryMinutes.ShouldBe(5);
        App.Factory.Services.GetRequiredService<TimeProvider>().ShouldBeSameAs(Clock);
    }

    [Fact]
    public void A_setting_override_reaches_the_startup_validation()
    {
        using var variant = App.CreateVariant(new Dictionary<string, string> { ["Otp:Mode"] = "Sms" });

        Should.Throw<InvalidOperationException>(variant.Start).Message.ShouldContain("Otp:Mode");
    }

    [Fact]
    public async Task A_service_override_replaces_the_apps_own()
    {
        await using var variant = App.CreateVariant(services: services =>
        {
            services.RemoveAll<IOtpSender>();
            services.AddSingleton<IOtpSender, FailingSender>();
        });
        var browser = new ApiClient(variant);

        await (await browser.RequestOtpAsync(Unique.Phone()))
            .ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
    }

    [Fact]
    public async Task A_restart_with_other_super_admins_is_used_through_the_variant()
    {
        var newAdmin = Unique.Phone();
        await using var variant = App.CreateVariant(new Dictionary<string, string> { ["Platform:SuperAdminPhones:0"] = newAdmin });
        variant.Start();

        var admin = await Login.On(variant).SuperAdminAsync();

        admin.Phone.ShouldBe(newAdmin);
        (await admin.MeAsync()).User.IsSuperAdmin.ShouldBeTrue();
        await (await admin.GetAsync("/api/v1/admin/clinics")).ShouldBeOkAsync();
        variant.Clock.ShouldNotBeSameAs(Clock);
    }

    [Fact]
    public async Task The_test_after_a_variant_starts_on_a_reset_database()
    {
        await using (var variant = App.CreateVariant(new Dictionary<string, string> { ["Platform:SuperAdminPhones:0"] = Unique.Phone() }))
            variant.Start();
        await Data.Clinic();

        // What happens before the next test of the class
        await App.BeforeTestAsync(GetType());

        await FreshDatabase.ShouldHoldOnlyTheSeedAsync(App);
        (await (await Login.SuperAdminAsync()).MeAsync()).User.IsSuperAdmin.ShouldBeTrue();
    }

    [Fact]
    public async Task A_service_override_cannot_point_the_app_at_another_database()
    {
        const string elsewhere = "drags_guard_variant_probe";
        using var variant = App.CreateVariant(services: services =>
            services.ConfigureDbContext<AppDbContext>(options =>
                options.UseNpgsql($"Host=localhost;Port=5432;Database={elsewhere};Username=drags;Password=drags")));

        Should.Throw<InvalidOperationException>(variant.Start).Message.ShouldContain("Test database guard");
        (await DatabaseExistsAsync(elsewhere)).ShouldBeFalse();
    }

    private static async Task<bool> DatabaseExistsAsync(string database)
    {
        await using var connection = new NpgsqlConnection(TestRun.AdminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand("SELECT count(*) FROM pg_database WHERE datname = @name", connection);
        command.Parameters.AddWithValue("name", database);
        return (long)await command.ExecuteScalarAsync() == 1;
    }

    private sealed class FailingSender : IOtpSender
    {
        public bool RevealsCode => false;

        public Task SendAsync(string phone, string code, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SMS gateway down");
    }
}
