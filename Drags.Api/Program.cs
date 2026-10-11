using Drags.Api.Database;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection"))
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

app.MapControllers();
app.MapFallbackToFile("index.html");

var context = app.Services.CreateScope().ServiceProvider.GetRequiredService<AppDbContext>();
await context.Database.MigrateAsync();

if (app.Environment.IsDevelopment())
{
    if (context.Drugs.Any() == false)
    {
        context.Drugs.AddRange(Enumerable.Range(1, 10000).Select(x => new Drug
        {
            Name = $"Drug number {x}",
            Description = $"Description of drug number {x}"
        }));
        await context.SaveChangesAsync();
    }
}

app.Run();
