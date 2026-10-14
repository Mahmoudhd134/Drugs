namespace Drags.Domain.Common;

/// <summary>Maximum lengths shared by the database columns and request validation.</summary>
public static class FieldLimits
{
    public const int NameMaxLength = 256;
    /// <summary>E.164 is at most 16 characters.</summary>
    public const int PhoneMaxLength = 20;
    public const int RoleNameMaxLength = 100;
    public const int PermissionMaxLength = 100;
}
