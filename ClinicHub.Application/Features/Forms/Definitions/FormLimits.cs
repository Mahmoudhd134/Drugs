namespace ClinicHub.Application.Features.Forms.Definitions;

/// <summary>The outer limits of a form (design dynamic-forms § 4.3).</summary>
public static class FormLimits
{
    /// <summary>1 MB of the definition's JSON text, in UTF-8 bytes as sent: about 170 times the POC's eye exam.</summary>
    public const int DefinitionMaxBytes = 1_048_576;
}
