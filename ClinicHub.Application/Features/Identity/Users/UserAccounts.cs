using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Domain.Identity;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Identity.Users;

/// <inheritdoc />
internal sealed class UserAccounts(IAppDbContext db) : IUserAccounts
{
    public async Task<User> GetOrCreateAsync(string phone, CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(phone);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Phone == phone, cancellationToken);
        if (user is not null)
            return user;

        user = new User { Phone = phone };
        db.Users.Add(user);
        await db.SaveChangesAsync(cancellationToken);
        return user;
    }
}
