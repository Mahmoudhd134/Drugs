using ClinicHub.Application.Common.Search;
using ClinicHub.Domain.Catalog;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ClinicHub.Infrastructure.Database.Configurations.Common;

/// <summary>
/// The search columns of the searched tables (design M1.7 D7): ordinary columns (<c>text NOT NULL DEFAULT ''</c>), EF
/// shadow properties the domain entities don't carry, filled by <see cref="ClinicAndTimestampsInterceptor"/> with
/// <see cref="SearchText"/> whenever a row is added or its source text changes. Each column records its source
/// properties in the <see cref="SourceAnnotation"/> annotation, which the interceptor reads: a new searched table needs
/// one configuration line. Display, ordering and the stored names are unchanged; the columns are only searched.
/// </summary>
public static class SearchNameConfiguration
{
    /// <summary>
    /// On a search column: its source properties, comma-separated in the order <see cref="SearchText"/> joins them
    /// (<c>"Name"</c>; <c>"NameAr,ActiveIngredients"</c>).
    /// </summary>
    public const string SourceAnnotation = "ClinicHub:SearchSource";

    /// <summary><see cref="SearchText.Column"/> = <see cref="SearchText.Fold"/> of <paramref name="sourceProperty"/> (e.g. "Name").</summary>
    public static void HasSearchName<T>(this EntityTypeBuilder<T> builder, string sourceProperty) where T : class =>
        SearchColumn(builder, SearchText.Column, sourceProperty);

    /// <summary>
    /// <c>Drugs</c>: <see cref="SearchText.OtherColumn"/> = <see cref="SearchText.OtherText"/> of the hidden Arabic name
    /// and the active ingredients.
    /// </summary>
    public static void HasSearchOther(this EntityTypeBuilder<Drug> builder) =>
        SearchColumn(builder, SearchText.OtherColumn, $"{nameof(Drug.NameAr)},{nameof(Drug.ActiveIngredients)}");

    /// <summary>The source properties of a search column (the annotation), empty for any other property.</summary>
    public static IReadOnlyList<string> SourcesOf(IReadOnlyProperty property) =>
        property.FindAnnotation(SourceAnnotation)?.Value is string sources ? sources.Split(',') : [];

    private static void SearchColumn<T>(EntityTypeBuilder<T> builder, string column, string sources) where T : class =>
        builder.Property<string>(column)
            .IsRequired()
            .HasDefaultValue("")
            .HasAnnotation(SourceAnnotation, sources);
}
