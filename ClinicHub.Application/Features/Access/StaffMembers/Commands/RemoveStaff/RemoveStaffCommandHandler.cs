using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Access.Authorization;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Access.StaffMembers.Commands.RemoveStaff;

/// <summary>
/// Only the staff entry is invalidated: the user's own entry holds the super-admin flag only, and their contexts are
/// read from the database (login, refresh, switch, <c>/auth/contexts</c>), so the clinic leaves them at once; no
/// session is revoked (design D7: a refresh with no context left ends the session).
/// </summary>
internal sealed class RemoveStaffCommandHandler(IAppDbContext db, IAccessCache accessCache, IPostCommitActions postCommit)
    : ICommandHandler<RemoveStaffCommand>
{
    public async Task<Result> Handle(RemoveStaffCommand command, CancellationToken cancellationToken)
    {
        var staff = await db.Staff.WithRoles().FirstOrDefaultAsync(s => s.Id == command.Id, cancellationToken);
        if (staff is null)
            return StaffErrors.NotFound;
        if (StaffRules.StopsBeingActiveOwner(staff, staysActiveOwner: false)
            && !await db.Staff.ActiveOwners().AnyAsync(s => s.Id != staff.Id, cancellationToken))
            return StaffErrors.LastOwner;

        // The tracked staff roles are deleted with it (cascade)
        db.Staff.Remove(staff);
        await db.SaveChangesAsync(cancellationToken);

        var staffId = staff.Id;
        await postCommit.AddAsync(token => accessCache.InvalidateStaffAsync(staffId, token));
        return Result.Success();
    }
}
