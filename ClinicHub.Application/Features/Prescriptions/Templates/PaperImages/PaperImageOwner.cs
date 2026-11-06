using ClinicHub.Application.Features.Attachments.Files;

namespace ClinicHub.Application.Features.Prescriptions.Templates.PaperImages;

/// <summary>
/// Who a clinic's paper image belongs to (step 4 design § 4): one per clinic, and the clinic filter separates clinics. It isn't
/// the template row's: deleting the template keeps the picture (P1).
/// </summary>
public static class PaperImageOwner
{
    public const string RefId = "current";

    public static readonly AttachmentOwner Current = new(AttachmentModules.ClinicPaper, RefId);
}
