using ClinicHub.Api.Controllers;
using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Features.Access.StaffMembers;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.AddStaff;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.RemoveStaff;
using ClinicHub.Application.Features.Access.StaffMembers.Commands.UpdateStaff;
using ClinicHub.Application.Features.Access.StaffMembers.Queries.GetStaff;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Features.Platform;

public record AddStaffRequest(string Phone, string FullName, List<int> RoleIds);
public record UpdateStaffRequest(string FullName, bool? IsActive, List<int> RoleIds);

/// <summary>
/// The super admin manages one clinic's staff (design M1.5 § 6). <see cref="AdminClinicAttribute"/> makes the route's
/// clinic the request's clinic (404 <c>notFound</c> for a missing, deleted or template clinic), so a staff id of
/// another clinic is simply not found.
/// </summary>
[Route("api/v1/admin/clinics/{clinicId:int}/staff")]
[Authorize(Policy = AuthPolicies.PlatformAdmin)]
[AdminClinic]
public class AdminStaffController(ISender sender) : BaseApiController
{
    [HttpGet]
    public async Task<ActionResult<PagedResult<StaffMemberDto>>> GetAll(string search = "", int page = 1,
        int pageSize = 20, CancellationToken cancellationToken = default) =>
        (await sender.Send(new GetStaffQuery(search, page, pageSize), cancellationToken)).ToOk();

    /// <summary>No endpoint reads one staff member: <c>Location</c> points to the clinic's staff list.</summary>
    [HttpPost]
    public async Task<ActionResult<StaffMemberDto>> Add(int clinicId, [FromBody] AddStaffRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new AddStaffCommand(request.Phone, request.FullName, request.RoleIds), cancellationToken))
        .ToCreated(nameof(GetAll), _ => new { clinicId });

    [HttpPut("{staffId:int}")]
    public async Task<ActionResult<StaffMemberDto>> Update(int staffId, [FromBody] UpdateStaffRequest request,
        CancellationToken cancellationToken) =>
        (await sender.Send(new UpdateStaffCommand(staffId, request.FullName, request.IsActive, request.RoleIds),
            cancellationToken)).ToOk();

    [HttpDelete("{staffId:int}")]
    public async Task<IActionResult> Remove(int staffId, CancellationToken cancellationToken) =>
        (await sender.Send(new RemoveStaffCommand(staffId), cancellationToken)).ToNoContent();
}
