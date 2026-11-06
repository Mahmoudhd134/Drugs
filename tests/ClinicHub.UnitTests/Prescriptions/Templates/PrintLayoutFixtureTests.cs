using System.Text.RegularExpressions;
using ClinicHub.Application.Features.Prescriptions.Templates;
using ClinicHub.UnitTests.TestSupport;
using Shouldly;

namespace ClinicHub.UnitTests.Prescriptions.Templates;

/// <summary>
/// The C# half of the shared rule rows (contract § 4.2): <c>SavePrescriptionTemplateCommand.From(layout)</c> + the
/// validator, the errors compared in order; <c>PrescriptionLayoutRules.Round</c> on <c>rounding</c>. The SPA runs the same
/// file against <c>layout.ts</c>.
/// </summary>
[Trait("Area", "admin")]
public partial class PrintLayoutFixtureTests
{
    [Theory]
    [MemberData(nameof(PrintLayoutFixture.CaseNames), MemberType = typeof(PrintLayoutFixture))]
    [Trait("Case", "TPL-020")]
    [Trait("Case", "TPL-021")]
    [Trait("Case", "TPL-022")]
    [Trait("Case", "TPL-023")]
    [Trait("Case", "TPL-024")]
    [Trait("Case", "TPL-025")]
    [Trait("Case", "TPL-026")]
    [Trait("Case", "TPL-027")]
    [Trait("Case", "TPL-028")]
    [Trait("Case", "TPL-029")]
    [Trait("Case", "TPL-030")]
    [Trait("Case", "TPL-031")]
    [Trait("Case", "TPL-032")]
    [Trait("Case", "TPL-208")]
    [Trait("Case", "TPL-209")]
    [Trait("Case", "TPL-210")]
    [Trait("Case", "TPL-211")]
    [Trait("Case", "TPL-212")]
    [Trait("Case", "TPL-213")]
    [Trait("Case", "TPL-214")]
    [Trait("Case", "TPL-607")]
    [Trait("Case", "TPL-610")]
    [Trait("Case", "TPL-705")]
    [Trait("Case", "TPL-724")]
    public void The_validator_answers_every_row_exactly_its_errors_in_order(string name)
    {
        var row = PrintLayoutFixture.Find(name);

        var answer = TemplateLayouts.Check(PrintLayoutFixture.ToLayout(row));

        answer.Errors.ShouldBe(row.Errors.Select(e => new ApiFieldError(e.Code, e.Field)).ToList(), "the API's errors for this layout");
        if (row.Valid)
        {
            answer.IsValid.ShouldBeTrue();
        }
        else
        {
            answer.Status.ShouldBe(400);
            answer.Code.ShouldBe(row.Errors[0].Code);
        }
    }

    [Fact]
    [Trait("Case", "TPL-209")]
    public void Round_agrees_with_every_rounding_row()
    {
        var rows = PrintLayoutFixture.Rounding;

        rows.Count.ShouldBeGreaterThanOrEqualTo(10);
        foreach (var row in rows)
            PrescriptionLayoutRules.Round(row.Value).ShouldBe(row.Rounded, $"Round({row.Value})");
    }

    [Fact]
    public void Fixture_rows_follow_the_schema()
    {
        var rows = PrintLayoutFixture.Cases;

        rows.Count.ShouldBeGreaterThanOrEqualTo(96);
        rows.Select(r => r.Name).ShouldBeUnique();
        foreach (var row in rows)
        {
            row.ShouldSatisfyAllConditions(
                () => row.Ids.ShouldNotBeEmpty(row.Name),
                () => row.Ids.ShouldAllBe(id => CaseId().IsMatch(id), row.Name),
                () => (row.Errors.Count == 0).ShouldBe(row.Valid, $"{row.Name}: `errors` empty only on valid rows"));
        }
    }

    [Fact]
    public void Fixture_has_a_row_for_every_shared_rule_case()
    {
        string[] expected =
        [
            "TPL-020", "TPL-021", "TPL-022", "TPL-023", "TPL-024", "TPL-025", "TPL-026", "TPL-027", "TPL-028", "TPL-029", "TPL-030",
            "TPL-031", "TPL-032", "TPL-208", "TPL-209", "TPL-210", "TPL-211", "TPL-212", "TPL-213", "TPL-214",
            "TPL-607", "TPL-610", "TPL-705", "TPL-724",
        ];

        var covered = PrintLayoutFixture.Cases.SelectMany(r => r.Ids).ToHashSet();
        expected.Where(id => !covered.Contains(id)).ShouldBeEmpty();
    }

    [Fact]
    [Trait("Case", "TPL-724")]
    public void The_rows_of_the_over_50_case_hold_more_than_50_items_and_a_calibration()
    {
        var rows = PrintLayoutFixture.Cases.Where(r => r.Ids.Contains("TPL-724")).ToList();

        rows.ShouldNotBeEmpty();
        foreach (var row in rows)
        {
            var layout = PrintLayoutFixture.ToLayout(row);
            layout.Items.Count.ShouldBeGreaterThan(50, row.Name);
            layout.Calibration.ShouldNotBeNull(row.Name);
        }
    }

    [Fact]
    [Trait("Case", "TPL-610")]
    public void The_null_comes_before_the_range_in_the_rows_that_hold_both()
    {
        // The session's ruling on the contract: all of rule 9, then all of rule 10, as rules 4 and 5 work
        PrintLayoutFixture.Find("calibration X out of range and Y null: the null first").Errors
            .ShouldBe([new("calibration.yMm", "invalidRequest"), new("calibration.xMm", "templateCalibrationInvalid")]);
        PrintLayoutFixture.Find("calibration X null and Y out of range: the null first").Errors
            .ShouldBe([new("calibration.xMm", "invalidRequest"), new("calibration.yMm", "templateCalibrationInvalid")]);
    }

    [Theory]
    [InlineData("a name of 60 characters", 60)]
    [InlineData("a name of 61 characters", 61)]
    public void The_name_length_rows_hold_the_length_they_say(string rowName, int length)
    {
        var name = PrintLayoutFixture.ToLayout(PrintLayoutFixture.Find(rowName)).Items[1].Name;

        name.Length.ShouldBe(length);
    }

    [Theory]
    [InlineData("static text of 1000 characters", 1000)]
    [InlineData("static text of 1001 characters", 1001)]
    public void The_static_text_length_rows_hold_the_length_they_say(string rowName, int length)
    {
        var text = PrintLayoutFixture.ToLayout(PrintLayoutFixture.Find(rowName)).Items[1].Text;

        text.Length.ShouldBe(length);
    }

    [GeneratedRegex(@"^TPL-\d{3}$")]
    private static partial Regex CaseId();
}
