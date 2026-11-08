using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Forms.Definitions.Queries.GetForm;

/// <summary>A form with its active version's definition; <see cref="FormErrors.NotFound"/> when missing or deleted.</summary>
public record GetFormQuery(int Id) : IQuery<FormDetails>;
