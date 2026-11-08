using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicHub.IntegrationTests.Forms;

/// <summary>What a test says about a form's usage (design D6: nothing real uses a form yet). Not used unless marked.</summary>
public sealed class FormUsageSwitch : IFormUsage
{
    private readonly HashSet<int> used = [];

    /// <summary>When true, the next checks throw, so a save fails in the middle of its transaction (FRM-165).</summary>
    public bool ThrowOnCheck { get; set; }

    public void MarkUsed(int formId) => used.Add(formId);

    public void MarkNotUsed(int formId) => used.Remove(formId);

    public void Reset()
    {
        used.Clear();
        ThrowOnCheck = false;
    }

    public Task<bool> IsUsedAsync(int formId, CancellationToken cancellationToken = default) =>
        ThrowOnCheck ? throw new InvalidOperationException("The test made the usage check fail.") : Task.FromResult(used.Contains(formId));
}

/// <summary>A collection's app with <see cref="FormUsageSwitch"/> in place of the real <c>IFormUsage</c>.</summary>
public sealed class FormsAppFixture : AppFixture
{
    public FormUsageSwitch Usage => Factory.Services.GetRequiredService<FormUsageSwitch>();

    protected override ClinicHubFactory CreateFactory(string connectionString) =>
        new(connectionString, services: services =>
        {
            services.AddSingleton<FormUsageSwitch>();
            services.AddSingleton<IFormUsage>(provider => provider.GetRequiredService<FormUsageSwitch>());
        });
}

/// <summary>Base of the classes on <see cref="FormsSavingCollection"/>: the switch starts each test with nothing used.</summary>
public abstract class FormSavingTest(FormsAppFixture app) : IntegrationTest(app)
{
    protected FormUsageSwitch Usage => app.Usage;

    protected override Task SetUpAsync()
    {
        app.Usage.Reset();
        return Task.CompletedTask;
    }
}
