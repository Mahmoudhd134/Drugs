namespace ClinicHub.Domain.Common;

/// <summary>Maximum lengths shared by the database columns and request validation.</summary>
public static class FieldLimits
{
    public const int NameMaxLength = 256;
    /// <summary>E.164 is at most 16 characters.</summary>
    public const int PhoneMaxLength = 20;
    public const int RoleNameMaxLength = 100;
    public const int PermissionMaxLength = 100;
    /// <summary>A category's or subcategory's English or Arabic name (design M1.7 D5).</summary>
    public const int CategoryNameMaxLength = 100;
    /// <summary>A drug's active ingredients, one line (design M1.7 D3).</summary>
    public const int ActiveIngredientsMaxLength = 1000;
    /// <summary>An attachment's module (docs/design/attachments.md § 4).</summary>
    public const int AttachmentModuleMaxLength = 50;
    /// <summary>An attachment's owner key as text.</summary>
    public const int AttachmentRefIdMaxLength = 64;
    public const int AttachmentFileNameMaxLength = 256;
    public const int AttachmentTypeKeyMaxLength = 20;
    public const int AttachmentStorageKeyMaxLength = 200;
}
