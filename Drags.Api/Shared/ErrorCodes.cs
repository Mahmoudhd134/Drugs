namespace Drags.Api.Shared;

/// <summary>
/// Machine-readable error codes returned in the "code" field of error responses.
/// The frontend maps each code to a translated message.
/// </summary>
public static class ErrorCodes
{
    public const string NameRequired = "nameRequired";
    public const string NameTooLong = "nameTooLong";
    public const string DrugsRequired = "drugsRequired";
    public const string DrugNotFound = "drugNotFound";
    public const string InvalidDosing = "invalidDosing";

    /// <summary>Returns an error code for an invalid name, or null when valid.</summary>
    public static string ValidateName(string name) =>
        string.IsNullOrWhiteSpace(name) ? NameRequired
        : name.Trim().Length > Database.AppDbContext.NameMaxLength ? NameTooLong
        : null;
}
