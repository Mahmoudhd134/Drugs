using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.DeleteForm;

/// <summary>Soft delete, final for now (design dynamic-forms D8): the rows stay, no route restores a form.</summary>
public record DeleteFormCommand(int Id) : ICommand;
