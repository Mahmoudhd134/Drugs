using Drags.Api.Database;
using Drags.Api.Features.Platform;
using Drags.Api.Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddScoped<ClinicContext>();
builder.Services.AddScoped<IClinicContext>(serviceProvider => serviceProvider.GetRequiredService<ClinicContext>());

builder.Services.AddDbContext<AppDbContext>(options => options
    .UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
    .AddInterceptors(new ClinicAndTimestampsInterceptor())
);

builder.Services.Configure<AppSettings>(builder.Configuration);

builder.Services.AddSingleton(serviceProvider => serviceProvider.GetRequiredService<IOptions<AppSettings>>().Value);

var app = builder.Build();

var appSettings = app.Services.GetRequiredService<AppSettings>();

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
    .WithOrigins(appSettings.AllowedOrigins.ToArray())
    .AllowAnyHeader()
    .AllowAnyMethod());

// TEMPORARY until Phase 2 (login): sets the request's clinic
app.UseMiddleware<TemporaryClinicMiddleware>();

app.MapControllers();
app.MapFallbackToFile("index.html");

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await context.Database.MigrateAsync();
    await StartupSeeder.SeedAsync(context, scope.ServiceProvider.GetRequiredService<ClinicContext>(),
        app.Environment.IsDevelopment());
}

app.Run();
