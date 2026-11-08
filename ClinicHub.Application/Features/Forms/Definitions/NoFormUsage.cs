namespace ClinicHub.Application.Features.Forms.Definitions;

/// <summary>Nothing uses a form yet (design D6): every save stays on the active version until a consumer exists.</summary>
internal sealed class NoFormUsage : IFormUsage
{
    public Task<bool> IsUsedAsync(int formId, CancellationToken cancellationToken = default) => Task.FromResult(false);
}
