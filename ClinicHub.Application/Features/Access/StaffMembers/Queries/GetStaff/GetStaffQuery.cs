using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;

namespace ClinicHub.Application.Features.Access.StaffMembers.Queries.GetStaff;

/// <summary>
/// A page of the current clinic's staff (active or not) by full name, then id. <paramref name="Search"/> matches the
/// full name (case-insensitive <c>Contains</c>); a phone-like term (only digits, Arabic-Indic too, spaces,
/// <c>+ - ( )</c>) also matches the phone's digits: leading zeros are dropped first, so a local <c>0100…</c> or an
/// international <c>0020…</c> finds the stored <c>+20100…</c>.
/// </summary>
public record GetStaffQuery(string Search, int Page, int PageSize) : IQuery<PagedResult<StaffMemberDto>>;
