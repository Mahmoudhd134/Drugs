using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.Clinics.Queries.GetClinic;

/// <summary>A managed clinic with its owners; <see cref="ClinicErrors.NotFound"/> for a missing, deleted or template clinic.</summary>
public record GetClinicQuery(int Id) : IQuery<ClinicDetails>;
