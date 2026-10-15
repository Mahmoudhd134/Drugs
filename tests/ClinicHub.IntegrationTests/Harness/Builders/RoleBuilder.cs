using System.Runtime.CompilerServices;
using ClinicHub.Application.Features.Access;
using ClinicHub.Application.Features.Access.Roles;
using ClinicHub.Application.Features.Access.Roles.Commands.CreateRole;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary><see cref="CreateRoleCommand"/> in the clinic (as the admin screen; keys are stored with their requirements).</summary>
public sealed class RoleBuilder(AppFixture app, ClinicHandle clinic)
{
    private string name = Unique.Name("Role", "دور");
    private List<string> permissions = [Permissions.Drugs.List];

    public RoleBuilder Named(string value)
    {
        name = value;
        return this;
    }

    /// <summary>Exactly these keys (<c>Permissions.Drugs.Create</c>…); none is allowed by the app too.</summary>
    public RoleBuilder WithPermissions(params string[] keys)
    {
        permissions = keys.ToList();
        return this;
    }

    public async Task<RoleDto> CreateAsync() =>
        (await app.SendAsync(new CreateRoleCommand(name, permissions), clinic.Id)).ShouldSucceed();

    public TaskAwaiter<RoleDto> GetAwaiter() => CreateAsync().GetAwaiter();
}
