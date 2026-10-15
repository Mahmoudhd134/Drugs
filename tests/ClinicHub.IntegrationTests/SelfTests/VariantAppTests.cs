using System.Net;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Identity.Login;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
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

        await (await browser.RequestOtpAsync(Harness.Builders.Unique.Phone()))
            .ShouldBeProblemAsync(HttpStatusCode.InternalServerError, "unexpected");
    }

    private sealed class FailingSender : IOtpSender
    {
        public bool RevealsCode => false;

        public Task SendAsync(string phone, string code, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("SMS gateway down");
    }
}
