using ClinicHub.Application.Common.Abstractions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// <see cref="IClinicScope"/>'s contract for developers (its doc comment; design M1.5 D2): entering the clinic already
/// set is a no-op success, entering a different one throws (a request never changes clinic halfway), and <c>Use</c>
/// restores the previous clinic once. No HTTP request reaches these paths (the admin filter enters once per request,
/// provisioning uses <c>Use</c> on a new clinic), so the app's own scope is called directly, on real clinics.
/// </summary>
[Collection(AdminCollection.Name)]
[Trait("Area", "admin")]
public class ClinicScopeContractTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    public async Task Entering_the_clinic_already_set_is_a_success_that_keeps_it()
    {
        var clinic = await Data.Clinic();
        await using var scope = App.Factory.Services.CreateAsyncScope();
        var clinicScope = scope.ServiceProvider.GetRequiredService<IClinicScope>();
        var context = scope.ServiceProvider.GetRequiredService<IClinicContext>();
        using var _ = clinicScope.Use(clinic.Id);

        var result = await clinicScope.EnterAsync(clinic.Id);

        result.IsSuccess.ShouldBeTrue();
        context.ClinicId.ShouldBe(clinic.Id);
    }

    [Fact]
    public async Task Entering_another_clinic_than_the_one_set_throws_and_keeps_the_first()
    {
        var first = await Data.Clinic();
        var other = await Data.Clinic();
        await using var scope = App.Factory.Services.CreateAsyncScope();
        var clinicScope = scope.ServiceProvider.GetRequiredService<IClinicScope>();
        var context = scope.ServiceProvider.GetRequiredService<IClinicContext>();
        (await clinicScope.EnterAsync(first.Id)).IsSuccess.ShouldBeTrue();

        var error = await Should.ThrowAsync<InvalidOperationException>(() => clinicScope.EnterAsync(other.Id));

        error.Message.ShouldContain($"clinic {first.Id}");
        context.ClinicId.ShouldBe(first.Id);
    }

    [Fact]
    public async Task Use_restores_the_previous_clinic_once_even_when_disposed_twice()
    {
        var outerClinic = await Data.Clinic();
        var innerClinic = await Data.Clinic();
        await using var scope = App.Factory.Services.CreateAsyncScope();
        var clinicScope = scope.ServiceProvider.GetRequiredService<IClinicScope>();
        var context = scope.ServiceProvider.GetRequiredService<IClinicContext>();
        context.ClinicId.ShouldBeNull();

        var outer = clinicScope.Use(outerClinic.Id);
        var inner = clinicScope.Use(innerClinic.Id);
        context.ClinicId.ShouldBe(innerClinic.Id);
        inner.Dispose();
        context.ClinicId.ShouldBe(outerClinic.Id);
        outer.Dispose();
        context.ClinicId.ShouldBeNull();
        inner.Dispose();

        context.ClinicId.ShouldBeNull();
    }
}
