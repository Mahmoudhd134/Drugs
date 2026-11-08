using ClinicHub.Domain.Forms;
using Shouldly;

namespace ClinicHub.UnitTests.Forms;

/// <summary>The one place that soft deletes a form (contract § 4).</summary>
[Trait("Area", "forms")]
public class FormTests
{
    [Fact]
    [Trait("Case", "FRM-168")]
    public void Delete_sets_both_fields_together()
    {
        var form = new Form();
        form.IsDeleted.ShouldBeFalse();
        form.DeletedAt.ShouldBeNull();
        var now = new DateTime(2026, 11, 9, 8, 30, 0, DateTimeKind.Utc);

        form.Delete(now);

        form.IsDeleted.ShouldBeTrue();
        form.DeletedAt.ShouldBe(now);
    }
}
