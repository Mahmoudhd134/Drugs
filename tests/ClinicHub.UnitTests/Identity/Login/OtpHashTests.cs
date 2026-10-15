using ClinicHub.Application.Features.Identity.Login;
using Shouldly;

namespace ClinicHub.UnitTests.Identity.Login;

/// <summary>
/// The stored form of a login code (auth tech § Data model): HMAC-SHA256 of <c>phone:code</c> with <c>Otp:HashKey</c>,
/// never the code.
/// </summary>
[Trait("Area", "auth")]
public class OtpHashTests
{
    [Fact]
    public void The_hash_is_HMAC_SHA256_of_phone_and_code()
    {
        // Reference value computed outside .NET (Python hmac/hashlib)
        OtpHash.Compute("test-key", "+201001234567", "123456")
            .ShouldBe("5FC47676F9811CE99D65ECF75280BFB4A9B82A3D563CA908AEED1B3A458654AC");
    }

    [Fact]
    public void The_hash_depends_on_the_key_the_phone_and_the_code()
    {
        var hash = OtpHash.Compute("test-key", "+201001234567", "123456");

        OtpHash.Compute("other-key", "+201001234567", "123456").ShouldNotBe(hash);
        OtpHash.Compute("test-key", "+201001234568", "123456").ShouldNotBe(hash);
        OtpHash.Compute("test-key", "+201001234567", "123457").ShouldNotBe(hash);
        OtpHash.Compute("test-key", "+201001234567", "123456").ShouldBe(hash, "same input, same hash");
    }

    [Fact]
    public void The_code_is_not_readable_in_the_hash()
    {
        OtpHash.Compute("test-key", "+201001234567", "123456").ShouldNotContain("123456");
    }
}
