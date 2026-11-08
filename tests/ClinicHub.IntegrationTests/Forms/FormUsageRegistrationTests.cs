using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>The real app's <c>IFormUsage</c> (contract S7, design D6): on the plain collection, so it's the registration production has and not the test switch.</summary>
[Collection(FormsCollection.Name)]
[Trait("Area", "forms")]
public class FormUsageRegistrationTests(AppFixture app) : IntegrationTest(app)
{
    [Fact]
    [Trait("Case", "FRM-082")]
    public async Task The_registered_usage_answers_false_for_any_id()
    {
        var form = await Data.Form();
        await using var scope = App.Factory.Services.CreateAsyncScope();
        var usage = scope.ServiceProvider.GetRequiredService<IFormUsage>();

        foreach (var id in new[] { form.Id, 0, -1, int.MaxValue })
            (await usage.IsUsedAsync(id)).ShouldBeFalse($"form {id}");
    }

    [Fact]
    [Trait("Case", "FRM-166")]
    public async Task The_usage_resolves_scoped_to_NoFormUsage()
    {
        await using var first = App.Factory.Services.CreateAsyncScope();
        await using var second = App.Factory.Services.CreateAsyncScope();

        var usage = first.ServiceProvider.GetRequiredService<IFormUsage>();

        usage.ShouldBeOfType<NoFormUsage>();
        first.ServiceProvider.GetRequiredService<IFormUsage>().ShouldBeSameAs(usage, "one instance in a scope");
        second.ServiceProvider.GetRequiredService<IFormUsage>().ShouldNotBeSameAs(usage, "another instance in another scope");
    }
}
