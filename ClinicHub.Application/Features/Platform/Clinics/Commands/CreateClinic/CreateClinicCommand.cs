using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.Clinics.Commands.CreateClinic;

/// <summary>
/// Creates a clinic provisioned from the template (design D5): default roles, the owner as staff with the Owner
/// role (an existing user of that phone is reused), a copy of the template's drugs and protocols. One transaction:
/// all or nothing. Everyone who creates a clinic sends it, the dev seed included. No cache invalidation: every
/// cached access entry is keyed by a staff, role or clinic id, and all of them are new (an existing user's
/// contexts are read from the database at login, refresh and switch).
/// </summary>
public record CreateClinicCommand(string Name, CreateClinicOwner Owner) : ICommand<ClinicDetails>;

/// <param name="Phone">As typed (local numbers use <c>Platform:DefaultRegion</c>).</param>
public record CreateClinicOwner(string Phone, string FullName);
