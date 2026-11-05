using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Commands.DeletePrescriptionTemplate;

/// <summary>Removes the current clinic's template; none is a success too. Takes no clinic id (design D5).</summary>
public record DeletePrescriptionTemplateCommand : ICommand;
