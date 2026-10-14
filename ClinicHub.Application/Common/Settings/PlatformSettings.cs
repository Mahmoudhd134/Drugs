namespace ClinicHub.Application.Common.Settings;

/// <summary>Config section <c>Platform</c>.</summary>
public class PlatformSettings
{
    /// <summary>Region for phone numbers typed without a country code.</summary>
    public string DefaultRegion { get; set; } = "EG";
    public List<string> SuperAdminPhones { get; set; } = [];
    /// <summary>Development seed only: staff with the Owner role in both demo clinics.</summary>
    public string DevOwnerPhone { get; set; }
    /// <summary>
    /// Development seed only: Assistant in "Demo clinic" (no deletes) and "Viewer" (read only) in
    /// "Second demo clinic".
    /// </summary>
    public string DevAssistantPhone { get; set; }
}
