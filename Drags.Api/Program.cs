using Drags.Api.Database;
using Drags.Api.Models;
using Drags.Api.Shared;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection"))
);


builder.Services.Configure<AppSettings>(builder.Configuration);

builder.Services.AddSingleton(serviceProvider => serviceProvider.GetRequiredService<IOptions<AppSettings>>().Value);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHttpsRedirection();
}

app.UseDefaultFiles();
app.UseStaticFiles();

var appSettings = app.Services.GetRequiredService<AppSettings>();

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
    if (context.Drags.Any() == false)
    {
        context.Drags.AddRange(Enumerable.Range(1, 10000).Select(x => new Drag()
        {
            Name = $"this is drag number {x}",
            Description = $"this is the description of drag number {x}"
        }));
        await context.SaveChangesAsync();
    }
}

app.Run();