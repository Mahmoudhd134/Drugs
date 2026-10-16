using ClinicHub.Api.Features.Platform;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Admin;

/// <summary>
/// The admin clinic filter's guard for developers (its contract: <c>[AdminClinic]</c> needs a <c>{clinicId:int}</c>
/// route value). Every admin controller has that route constraint, so no HTTP request can reach the guard: the filter
/// is run directly here, with the app's own <see cref="IClinicScope"/>, on a route without a numeric clinic id. A
/// misplaced <c>[AdminClinic]</c> must fail loudly instead of acting in no clinic.
/// </summary>
[Collection(AdminCollection.Name)]
[Trait("Area", "admin")]
public class AdminClinicFilterGuardTests(AppFixture app) : IntegrationTest(app)
{
    [Theory]
    [InlineData("abc")]
    [InlineData(null)]
    public async Task A_route_without_a_numeric_clinic_id_fails_loudly_and_never_runs_the_action(string clinicId)
    {
        await using var scope = App.Factory.Services.CreateAsyncScope();
        var filter = new AdminClinicFilter(scope.ServiceProvider.GetRequiredService<IClinicScope>());
        var routeData = new RouteData();
        if (clinicId is not null)
            routeData.Values[AdminClinicFilter.RouteKey] = clinicId;
        var actionContext = new ActionContext(new DefaultHttpContext { RequestServices = scope.ServiceProvider }, routeData,
            new ActionDescriptor { DisplayName = "Misplaced.Action" });
        var context = new ResourceExecutingContext(actionContext, new List<IFilterMetadata>(), new List<IValueProviderFactory>());
        var actionRan = false;

        var error = await Should.ThrowAsync<InvalidOperationException>(() => filter.OnResourceExecutionAsync(context, () =>
        {
            actionRan = true;
            return Task.FromResult<ResourceExecutedContext>(null);
        }));

        error.Message.ShouldContain("{clinicId:int}");
        error.Message.ShouldContain("Misplaced.Action");
        actionRan.ShouldBeFalse();
        context.Result.ShouldBeNull();
    }
}
