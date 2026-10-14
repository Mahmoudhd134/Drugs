using ClinicHub.Domain.Identity;

namespace ClinicHub.Application.Features.Identity.Users;

/// <summary>Users by phone (Identity module): the one way to find or create a user by phone (provisioning, staff, seeding).</summary>
public interface IUserAccounts
{
    /// <summary>
    /// The user of <paramref name="phone"/>, created (and saved) when there is none yet. The phone must already
    /// be normalized (<see cref="IPhoneNormalizer"/>, E.164). Creating saves the context, so call it inside the
    /// caller's transaction. Accepted (design D5): two requests creating the same new phone at the same moment hit
    /// the unique index, one fails with a 500 and works when sent again.
    /// </summary>
    Task<User> GetOrCreateAsync(string phone, CancellationToken cancellationToken = default);
}
