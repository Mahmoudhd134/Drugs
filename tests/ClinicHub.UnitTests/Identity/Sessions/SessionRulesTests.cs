using ClinicHub.Application.Features.Identity.Sessions;
using ClinicHub.Domain.Identity;
using Shouldly;

namespace ClinicHub.UnitTests.Identity.Sessions;

/// <summary>
/// Session rules (auth tech § Backend): the 30 s rotation grace, the session's context, and matching a picked context.
/// </summary>
[Trait("Area", "auth")]
public class SessionRulesTests
{
    [Fact]
    public void The_rotation_grace_is_30_seconds()
    {
        SessionRules.RotationGrace.ShouldBe(TimeSpan.FromSeconds(30));
    }

    [Fact]
    public void Set_context_stores_a_clinic_context()
    {
        var session = new Session();

        SessionRules.SetContext(session, ContextDto.ForClinic(7, "Clinic A", false, ["Owner"]));

        session.ContextType.ShouldBe("clinic");
        session.ClinicId.ShouldBe(7);
    }

    [Fact]
    public void Set_context_stores_the_platform_context_without_a_clinic()
    {
        var session = new Session { ContextType = "clinic", ClinicId = 7 };

        SessionRules.SetContext(session, ContextDto.Platform);

        session.ContextType.ShouldBe("platform");
        session.ClinicId.ShouldBeNull();
    }

    [Fact]
    public void Set_context_with_none_clears_it()
    {
        var session = new Session { ContextType = "clinic", ClinicId = 7 };

        SessionRules.SetContext(session, null);

        session.ContextType.ShouldBeNull();
        session.ClinicId.ShouldBeNull();
    }

    [Fact]
    public void A_clinic_context_matches_its_type_and_clinic()
    {
        var context = ContextDto.ForClinic(7, "Clinic A", false, ["Doctor"]);

        context.Matches("clinic", 7).ShouldBeTrue();
        context.Matches("clinic", 8).ShouldBeFalse();
        context.Matches("clinic", null).ShouldBeFalse();
        context.Matches("platform", null).ShouldBeFalse();
    }

    [Fact]
    public void The_platform_context_matches_platform_only()
    {
        ContextDto.Platform.Matches("platform", null).ShouldBeTrue();
        ContextDto.Platform.Matches("clinic", null).ShouldBeFalse();
    }
}
