using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Identity;
using ClinicHub.Api.Features.Platform;
using ClinicHub.Api.Shared;
using ClinicHub.Application;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Infrastructure;
using ClinicHub.Infrastructure.Database;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Secrets (Auth:Jwt:SigningKey, Otp:HashKey) come from environment variables outside Development
var appSettings = builder.Configuration.Get<AppSettings>() ?? new AppSettings();
appSettings.Validate();
builder.Services.AddSingleton(appSettings);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddIdentityModule(appSettings);
builder.Services.AddAccessModule();

var app = builder.Build();

if (appSettings.Otp.Mode == OtpModes.Display && !app.Environment.IsDevelopment())
    app.Logger.LogWarning(
        "Otp:Mode is Display in the {Environment} environment: login codes are shown on screen, so anyone can log in as any phone",
        app.Environment.EnvironmentName);

app.UseExceptionHandler();

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
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await context.Database.MigrateAsync();
    await StartupSeeder.SeedAsync(context, scope.ServiceProvider.GetRequiredService<ClinicContext>(),
        scope.ServiceProvider.GetRequiredService<IAccessCache>(),
        appSettings.Platform, app.Environment.IsDevelopment());
}

app.Run();
