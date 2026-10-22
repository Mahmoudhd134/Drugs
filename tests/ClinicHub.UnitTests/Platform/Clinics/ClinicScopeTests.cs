using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Features.Platform.Clinics;
using Shouldly;

namespace ClinicHub.UnitTests.Platform.Clinics;

/// <summary>
/// <c>IClinicScope.UseSharedCatalog()</c> (design M1.7 D2; M1.7b contract § 2.3): it opens shared-catalog writing
/// (<see cref="IClinicContext.WritingSharedCatalog"/>) for a block, nestable until the outermost dispose; it throws when
/// a clinic is in context, and <c>Use(clinicId)</c> throws inside it (a request never mixes the two). The "throws" is
/// an <see cref="InvalidOperationException"/>, as <c>EnterAsync</c>'s "a request never changes clinic halfway".
/// No database: <c>Use</c> and <c>UseSharedCatalog</c> don't read it.
/// </summary>
[Trait("Area", "isolation")]
public class ClinicScopeTests
{
    private readonly ClinicContext context = new();

    private ClinicScope Scope() => new(null, context);

    [Fact]
    [Trait("Case", "CAT-029")]
    public void Writing_is_open_inside_the_block_and_closed_once_it_is_disposed()
    {
        var scope = Scope();
        context.WritingSharedCatalog.ShouldBeFalse("before");

        var block = scope.UseSharedCatalog();
        context.WritingSharedCatalog.ShouldBeTrue("inside");
        context.ClinicId.ShouldBeNull("no clinic inside");

        block.Dispose();
        context.WritingSharedCatalog.ShouldBeFalse("after the dispose: the same scope can't write a shared row again");
        block.Dispose();
        context.WritingSharedCatalog.ShouldBeFalse("a second dispose changes nothing");
    }

    [Fact]
    [Trait("Case", "CAT-029")]
    public void A_nested_block_keeps_writing_open_until_the_outer_one_is_disposed()
    {
        var scope = Scope();

        var outer = scope.UseSharedCatalog();
        var inner = scope.UseSharedCatalog();
        inner.Dispose();
        context.WritingSharedCatalog.ShouldBeTrue("the inner block disposed, the outer one still open");

        outer.Dispose();
        context.WritingSharedCatalog.ShouldBeFalse("the outer block disposed");
    }

    [Fact]
    [Trait("Case", "CAT-029")]
    public void With_a_clinic_in_context_it_throws_and_writing_stays_closed()
    {
        var scope = Scope();
        using var clinic = scope.Use(7);

        Should.Throw<InvalidOperationException>(() => scope.UseSharedCatalog());

        context.WritingSharedCatalog.ShouldBeFalse();
        context.ClinicId.ShouldBe(7);
    }

    [Fact]
    [Trait("Case", "CAT-029")]
    public void Use_inside_it_throws_and_sets_no_clinic()
    {
        var scope = Scope();

        using (scope.UseSharedCatalog())
        {
            Should.Throw<InvalidOperationException>(() => scope.Use(7));
            context.ClinicId.ShouldBeNull();
            context.WritingSharedCatalog.ShouldBeTrue();
        }

        // Once the block is closed, a clinic can be used again
        using (scope.Use(7))
            context.ClinicId.ShouldBe(7);
    }
}
