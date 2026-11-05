using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Prescriptions.Templates.Queries.GetPrescriptionTemplate;

/// <summary>
/// The current clinic's template; <c>Result.Success(null)</c> when it has none (MVC answers 204). Takes no clinic id
/// (design D5): a clinic-side route sends the same query in step 2.
/// </summary>
public record GetPrescriptionTemplateQuery : IQuery<PrescriptionTemplateDto>;
