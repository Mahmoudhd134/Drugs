using ClinicHub.Application.Features.Identity.Users;
using Shouldly;

namespace ClinicHub.UnitTests.Identity.Users;

/// <summary>
/// Phones are stored and compared in E.164 (auth tech § Backend): parsed with the default region (EG), valid numbers
/// only (landlines too), otherwise null.
/// </summary>
[Trait("Area", "auth")]
public class PhoneNormalizerTests
{
    private static readonly PhoneNormalizer Normalizer = new();

    [Theory]
    [Trait("Tier", "Smoke")]
    [InlineData("01001234567")]
    [InlineData("+201001234567")]
    [InlineData("010 0123 4567")]
    [InlineData("010-0123-4567")]
    [InlineData("0020 100 123 4567")]
    [InlineData("٠١٠٠١٢٣٤٥٦٧")]
    [InlineData("  01001234567  ")]
    public void Every_way_of_typing_one_mobile_gives_the_same_E164(string typed)
    {
        Normalizer.Normalize(typed, "EG").ShouldBe("+201001234567");
    }

    [Fact]
    public void A_landline_is_accepted()
    {
        Normalizer.Normalize("0223456789", "EG").ShouldBe("+20223456789");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("phone")]
    [InlineData("0100123")]
    [InlineData("010012345678")]
    [InlineData("123")]
    [InlineData("+")]
    public void An_invalid_phone_is_null(string typed)
    {
        Normalizer.Normalize(typed, "EG").ShouldBeNull();
    }

    [Fact]
    public void Input_longer_than_40_characters_is_refused()
    {
        var padded40 = "01001234567".PadLeft(40);
        Normalizer.Normalize(padded40, "EG").ShouldBe("+201001234567", "40 characters are read");
        Normalizer.Normalize(" " + padded40, "EG").ShouldBeNull("41 characters are not");
    }

    [Fact]
    public void Local_numbers_use_the_given_region()
    {
        Normalizer.Normalize("2015550123", "US").ShouldBe("+12015550123");
        Normalizer.Normalize("+201001234567", "US").ShouldBe("+201001234567", "an international number keeps its country");
    }

    [Fact]
    public void Config_phones_are_normalized_or_stop_the_start_naming_the_setting()
    {
        ConfigPhones.Normalize(Normalizer, "01001234567", "EG", "Platform:SuperAdminPhones").ShouldBe("+201001234567");

        var error = Should.Throw<InvalidOperationException>(() =>
            ConfigPhones.Normalize(Normalizer, "123", "EG", "Platform:SuperAdminPhones"));
        error.Message.ShouldContain("Platform:SuperAdminPhones");
        error.Message.ShouldContain("'123'");
    }
}
