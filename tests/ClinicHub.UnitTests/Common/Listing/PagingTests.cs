using Shouldly;
// The Paging class lives in a folder of the same name
using PagingRules = ClinicHub.Application.Common.Paging.Paging;

namespace ClinicHub.UnitTests.Common.Listing;

/// <summary>
/// List paging (tech overview § Conventions, drugs tech § Backend): page ≥ 1, page size 1–100, and an offset that
/// always fits; the search term trimmed, lower-cased, control characters removed.
/// </summary>
[Trait("Area", "catalog")]
public class PagingTests
{
    [Theory]
    [InlineData(1, 20, 1, 20)]
    [InlineData(2, 20, 2, 20)]
    [InlineData(1, 0, 1, 1)]
    [InlineData(1, -5, 1, 1)]
    [InlineData(1, 1, 1, 1)]
    [InlineData(1, 100, 1, 100)]
    [InlineData(1, 101, 1, 100)]
    [InlineData(0, 20, 1, 20)]
    [InlineData(-1, 20, 1, 20)]
    [InlineData(int.MinValue, int.MinValue, 1, 1)]
    public void Page_and_page_size_are_kept_in_range(int page, int pageSize, int expectedPage, int expectedSize)
    {
        PagingRules.Normalize(page, pageSize).ShouldBe((expectedPage, expectedSize));
    }

    [Theory]
    [InlineData(20)]
    [InlineData(1)]
    [InlineData(100)]
    public void A_huge_page_keeps_its_offset_inside_an_int(int pageSize)
    {
        var (page, size) = PagingRules.Normalize(int.MaxValue, pageSize);

        page.ShouldBe(int.MaxValue / size);
        ((long)(page - 1) * size).ShouldBeLessThanOrEqualTo(int.MaxValue);
    }

    [Fact]
    public void The_largest_page_size_is_100()
    {
        PagingRules.MaxPageSize.ShouldBe(100);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("", "")]
    [InlineData("  Tobra  ", "tobra")]
    [InlineData("A\0B\tC\r\n", "abc")]
    [InlineData("قطرة أحمر", "قطرة أحمر")]
    public void Search_term_is_trimmed_lower_cased_without_control_characters(string search, string term)
    {
        PagingRules.SearchTerm(search).ShouldBe(term);
    }
}
