using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Paging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Search;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.StaffMembers.Queries.GetStaff;

internal sealed class GetStaffQueryHandler(IAppDbContext db)
    : IQueryHandler<GetStaffQuery, PagedResult<StaffMemberDto>>
{
    public async Task<Result<PagedResult<StaffMemberDto>>> Handle(GetStaffQuery query,
        CancellationToken cancellationToken)
    {
        var (page, pageSize) = Paging.Normalize(query.Page, query.PageSize);
        var staff = db.Staff.AsNoTracking();

        var term = SearchText.Term(query.Search);
        if (!string.IsNullOrEmpty(term))
        {
            var phoneDigits = PhoneDigits(term);
            staff = phoneDigits is null
                ? staff.Where(s => EF.Property<string>(s, SearchText.Column).Contains(term))
                : staff.Where(s => EF.Property<string>(s, SearchText.Column).Contains(term) || s.User.Phone.Contains(phoneDigits));
        }

        var totalCount = await staff.CountAsync(cancellationToken);
        var items = await staff
            .OrderBy(s => s.FullName).ThenBy(s => s.Id)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .SelectDto()
            .ToListAsync(cancellationToken);

        return new PagedResult<StaffMemberDto>(items, totalCount, page, pageSize);
    }

    /// <summary>
    /// The ASCII digits to look for in the stored E.164 phone when the term looks like a phone, else null. Any
    /// decimal digit counts (Arabic-Indic «٠١٠٠» too, as when adding staff) and is mapped to ASCII. Leading zeros
    /// dropped: the trunk prefix of a local number (<c>0100…</c>) and the <c>00</c> of an international one are not
    /// stored.
    /// </summary>
    private static string PhoneDigits(string term)
    {
        if (!term.All(c => char.IsDigit(c) || c is ' ' or '+' or '-' or '(' or ')'))
            return null;
        var digits = new string(term.Where(char.IsDigit).Select(c => (char)('0' + (int)char.GetNumericValue(c))).ToArray())
            .TrimStart('0');
        return digits.Length > 0 ? digits : null;
    }
}
