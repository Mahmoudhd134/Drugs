namespace ClinicHub.Application.Features.Attachments.Files;

/// <summary>
/// The modules a config <c>Attachments:Modules</c> key may name (compared exactly, so a wrong-case key stops the app). At run
/// time the service takes any module string of 1-50 characters and uses the global limits when it has no entry.
/// </summary>
public static class AttachmentModules
{
    public const string ClinicPaper = "clinicPaper";

    public static readonly IReadOnlySet<string> All = new HashSet<string>(StringComparer.Ordinal) { ClinicPaper };
}
