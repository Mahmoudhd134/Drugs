namespace ClinicHub.Application.Features.Forms.Definitions;

/// <summary>Whether a form is used or has a submission, so saving a change makes a new version (design D6).</summary>
public interface IFormUsage
{
    Task<bool> IsUsedAsync(int formId, CancellationToken cancellationToken = default);
}
