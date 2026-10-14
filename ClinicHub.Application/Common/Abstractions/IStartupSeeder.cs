namespace ClinicHub.Application.Common.Abstractions;

/// <summary>
/// Startup seeding, idempotent (runs on every start after the migrations): the template clinic, the super
/// admins and, in Development on an empty database, the demo data. Implemented in Infrastructure.
/// </summary>
public interface IStartupSeeder
{
    Task SeedAsync(bool isDevelopment);
}
