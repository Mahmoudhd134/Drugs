using System.Text.Json;
using System.Text.Json.Serialization;
using Drags.Domain.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Drags.Infrastructure.Database.Configurations.Catalog;

/// <summary>
/// Column setup for an owned <see cref="Dosing"/>, reusable on any entity:
/// <c>builder.OwnsOne(x => x.Dosing, DosingConfiguration.Configure)</c>.
/// </summary>
public static class DosingConfiguration
{
    /// <summary>Columns are prefixed with the property name.</summary>
    public static void Configure<TOwner>(OwnedNavigationBuilder<TOwner, Dosing> dosing) where TOwner : class
    {
        dosing.Property(x => x.DoseUnit).HasMaxLength(20);
        dosing.Property(x => x.Frequency).HasMaxLength(20);
        dosing.Property(x => x.FrequencyText).HasMaxLength(DosingRules.MaxFrequencyTextLength);
        dosing.Property(x => x.DurationUnit).HasMaxLength(20);
        dosing.Property(x => x.Eye).HasMaxLength(10);
        // The tapering schedule is a small list, stored as one JSON text column
        dosing.Property(x => x.TaperSteps)
            .HasConversion(
                steps => steps == null ? null : JsonSerializer.Serialize(steps, JsonOptions),
                json => json == null ? null : JsonSerializer.Deserialize<List<TaperStep>>(json, JsonOptions),
                new ValueComparer<List<TaperStep>>(
                    (a, b) => JsonSerializer.Serialize(a, JsonOptions) == JsonSerializer.Serialize(b, JsonOptions),
                    steps => JsonSerializer.Serialize(steps, JsonOptions).GetHashCode(),
                    steps => steps == null ? null : JsonSerializer.Deserialize<List<TaperStep>>(JsonSerializer.Serialize(steps, JsonOptions), JsonOptions)));
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
