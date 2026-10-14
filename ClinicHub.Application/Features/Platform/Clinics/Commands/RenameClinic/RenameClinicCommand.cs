using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.RenameClinic;

/// <summary>
/// Renames a managed clinic (not the template, not a deleted one). No cache invalidation: no cached access
/// entry holds the name (contexts read it from the database).
/// </summary>
public record RenameClinicCommand(int Id, string Name) : ICommand<ClinicDetails>;
