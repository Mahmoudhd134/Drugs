using System.Text.RegularExpressions;
using ClinicHub.Application.Features.Catalog.DrugGroups;
using ClinicHub.Application.Features.Catalog.DrugGroups.Commands.CreateDrugGroup;
using ClinicHub.Application.Features.Catalog.Drugs.Commands.CreateDrug;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;
using DosingRules = ClinicHub.Domain.Catalog.DosingRules;

namespace ClinicHub.UnitTests.Catalog.Parity;

/// <summary>
/// The parity fixture (M1.6 design D6) against the C# side: <c>DosingRules</c> and the drug/group validators as the
/// API runs them. The frontend runs the same file against <c>types.ts</c>.
/// </summary>
[Trait("Area", "catalog")]
public partial class DosingFixtureTests
{
    [Theory]
    [MemberData(nameof(DosingFixture.CaseNames), MemberType = typeof(DosingFixture))]
    [Trait("Case", "DOSE-066")]
    public void CSharp_rules_agree_with_the_fixture(string name)
    {
        var row = DosingFixture.Find(name);
        var input = DosingFixture.ToDosing(row.Input);
        var groupLine = row.Owner == DosingCase.GroupLine;

        var normalized = DosingRules.Normalize(input);
        DosingRules.IsValid(normalized, allowAskEye: groupLine).ShouldBe(row.Valid, "DosingRules.IsValid(Normalize(input))");

        if (row.Valid)
            DosingFixture.SetFields(normalized).ShouldBe(DosingFixture.SetFields(DosingFixture.ToDosing(row.Normalized)),
                "Normalize(input), set fields only");

        var answer = groupLine
            ? ApiValidation.Run(new CreateDrugGroupCommandValidator(),
                new CreateDrugGroupCommand("G", [new SaveDrugGroupItem(1, input)]))
            : ApiValidation.Run(new CreateDrugCommandValidator(), new CreateDrugCommand("Tobradex", null, input));
        List<ApiFieldError> expectedErrors = row.Valid ? [] : row.Errors.Select(e => new ApiFieldError(e.Code, e.Field)).ToList();
        answer.Errors.ShouldBe(expectedErrors, "the API's errors for this dosing");
        if (!row.Valid)
            answer.Status.ShouldBe(400);
    }

    [Fact]
    public void Fixture_rows_follow_the_schema()
    {
        var rows = DosingFixture.Cases;

        rows.Count.ShouldBeGreaterThanOrEqualTo(60);
        rows.Select(r => r.Name).ShouldBeUnique();
        foreach (var row in rows)
        {
            row.ShouldSatisfyAllConditions(
                () => row.Name.ShouldNotBeNullOrWhiteSpace(),
                () => row.Ids.ShouldNotBeEmpty(row.Name),
                () => row.Ids.ShouldAllBe(id => CaseId().IsMatch(id), row.Name),
                () => row.Owner.ShouldBeOneOf(DosingCase.DrugDefault, DosingCase.GroupLine),
                () => row.Input.ShouldNotBeNull(row.Name),
                () => row.HasNormalized.ShouldBe(row.Valid, $"{row.Name}: `normalized` only on valid rows"),
                () => (row.Errors is { Count: > 0 }).ShouldBe(!row.Valid, $"{row.Name}: `errors` only on invalid rows"));
        }
    }

    [Fact]
    public void Fixture_covers_every_dosing_and_taper_rule_case()
    {
        // The C# side of the D6 cases: every DOSE/TAPER limit and normalization rule has at least one row
        string[] expected =
        [
            "DOSE-043", "DOSE-044", "DOSE-045", "DOSE-046", "DOSE-047", "DOSE-048", "DOSE-049", "DOSE-050", "DOSE-051",
            "DOSE-052", "DOSE-054", "DOSE-055", "DOSE-056", "DOSE-057", "DOSE-058", "DOSE-059", "DOSE-061", "DOSE-062",
            "DOSE-063", "DOSE-064", "DOSE-065",
            "TAPER-002", "TAPER-003", "TAPER-004", "TAPER-005", "TAPER-006", "TAPER-007", "TAPER-008", "TAPER-009",
            "TAPER-010", "TAPER-011", "TAPER-012", "TAPER-013", "TAPER-014", "TAPER-015", "TAPER-016", "TAPER-017",
            "TAPER-018", "TAPER-019", "TAPER-080",
        ];

        var covered = DosingFixture.Cases.SelectMany(r => r.Ids).ToHashSet();
        expected.Where(id => !covered.Contains(id)).ShouldBeEmpty();
        DosingFixture.Cases.Count(r => r.Owner == DosingCase.GroupLine).ShouldBeGreaterThan(0);
        DosingFixture.Cases.Count(r => r.Valid).ShouldBeGreaterThan(0);
        DosingFixture.Cases.Count(r => !r.Valid).ShouldBeGreaterThan(0);
    }

    [GeneratedRegex(@"^(DOSE|TAPER)-\d{3}$")]
    private static partial Regex CaseId();
}
