using System.Security.Cryptography;
using System.Text;

namespace ClinicHub.Application.Features.Identity.Login;

/// <summary>Stored form of a login code: HMAC-SHA256 of <c>phone:code</c> with <c>Otp:HashKey</c> (never the code).</summary>
internal static class OtpHash
{
    public static string Compute(string hashKey, string phone, string code)
    {
        var mac = HMACSHA256.HashData(Encoding.UTF8.GetBytes(hashKey), Encoding.UTF8.GetBytes($"{phone}:{code}"));
        return Convert.ToHexString(mac);
    }
}
