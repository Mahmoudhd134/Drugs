using ClinicHub.Api;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Api.Shared;
using ClinicHub.Application;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Infrastructure;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Secrets (Auth:Jwt:SigningKey, Otp:HashKey) come from environment variables outside Development
var appSettings = builder.Configuration.Get<AppSettings>() ?? new AppSettings();
appSettings.Validate(builder.Environment.IsDevelopment());
// The validated sections, for Application and Infrastructure
builder.Services.AddSingleton(appSettings.Auth);
builder.Services.AddSingleton(appSettings.Otp);
builder.Services.AddSingleton(appSettings.Platform);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddApplication(builder.Configuration);
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddIdentityModule(appSettings.Auth);
builder.Services.AddAccessModule();
builder.Services.AddApi();

var app = builder.Build();

if (appSettings.Otp.Mode == OtpModes.Display && !app.Environment.IsDevelopment())
    app.Logger.LogWarning(
        "Otp:Mode is Display in the {Environment} environment: login codes are shown on screen, so anyone can log in as any phone",
        app.Environment.EnvironmentName);

// Every error response is a ProblemDetails from ApiProblemFactory (docs/tech/overview.md, "Errors")
app.UseExceptionHandler();
app.UseProblemStatusCodePages();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHttpsRedirection();
}

app.UseDefaultFiles();
app.UseStaticFiles();

app.UseCors(cors => cors
    .WithOrigins(appSettings.AllowedOrigins?.ToArray() ?? [])
    .AllowAnyHeader()
    .AllowAnyMethod());

app.UseAuthentication();
// The request's clinic comes only from the access token's clinic_id
app.UseClinicFromToken();
app.UseAuthorization();

app.MapControllers();
// Client routes get the SPA; unknown /api routes get a 404 ProblemDetails instead
app.MapFallbackToFile("{*path:regex(^(?!api(/|$))):nonfile}", "index.html");

using (var scope = app.Services.CreateScope())
{
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    await scope.ServiceProvider.GetRequiredService<IStartupSeeder>().SeedAsync(app.Environment.IsDevelopment());
}

app.Run();

// Lets the integration tests host the app (WebApplicationFactory<Program>)
public partial class Program;
