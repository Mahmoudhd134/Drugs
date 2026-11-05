using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Clients;
using Shouldly;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

/// <summary>File contents with the right start and unique bytes after it: the type's real samples are in the unit tests.</summary>
public static class FileSamples
{
    public static byte[] Png(int size = 256) => Sample([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], size);

    public static byte[] Jpeg(int size = 256) => Sample([0xFF, 0xD8, 0xFF, 0xE0], size);

    public static byte[] Pdf(int size = 256) => Sample("%PDF-1.7\n"u8.ToArray(), size);

    /// <summary>An executable's bytes.</summary>
    public static byte[] Exe(int size = 256) => Sample("MZ\x90\0\x03\0\0\0"u8.ToArray(), size);

    public static byte[] Text(string text) => Encoding.UTF8.GetBytes(text);

    private static byte[] Sample(byte[] start, int size)
    {
        var bytes = new byte[size];
        RandomNumberGenerator.Fill(bytes);
        start.CopyTo(bytes, 0);
        return bytes;
    }
}

/// <summary>
/// A multipart body written byte by byte as a browser writes it, so a test controls what a client can send: any file name, a part's
/// headers, several parts. A plain name goes as a browser sends it, raw UTF-8 in <c>filename="…"</c>; a name a quoted string can't hold
/// exactly (a quote, a backslash, a control character, a bidi override, leading spaces) goes as <c>filename*</c>, which the server decodes exactly.
/// </summary>
public static class MultipartBody
{
    public const string Boundary = "----ClinicHubAttachmentTest7MA4YWxkTrZu0gW";
    public static readonly string ContentType = $"multipart/form-data; boundary={Boundary}";

    public static string FilePart(string fileName, string declaredType = "application/octet-stream", string field = "file",
        string extraHeaders = "") =>
        $"--{Boundary}\r\nContent-Disposition: form-data; name=\"{field}\"; {FileNameParameter(fileName)}\r\n{extraHeaders}Content-Type: {declaredType}\r\n\r\n";

    public static string FieldPart(string name, string value) =>
        $"--{Boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n";

    /// <summary>One file part, with optional form fields before it, and the closing boundary.</summary>
    public static HttpContent Of(string fileName, byte[] bytes, string declaredType = "application/octet-stream", string field = "file",
        string extraHeaders = "", IEnumerable<(string Name, string Value)> fields = null)
    {
        var body = new MemoryStream(bytes.Length + 512);
        foreach (var (name, value) in fields ?? [])
            Write(body, FieldPart(name, value));
        Write(body, FilePart(fileName, declaredType, field, extraHeaders));
        body.Write(bytes);
        Write(body, $"\r\n--{Boundary}--\r\n");
        return Raw(body.ToArray());
    }

    /// <summary>A body exactly as given, under the test's boundary.</summary>
    public static HttpContent Raw(byte[] body, string contentType = null)
    {
        var content = new ByteArrayContent(body);
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType ?? ContentType);
        return content;
    }

    public static byte[] Utf8(string text) => Encoding.UTF8.GetBytes(text);

    private static void Write(Stream stream, string text) => stream.Write(Encoding.UTF8.GetBytes(text));

    private static string FileNameParameter(string fileName) =>
        NeedsExactEncoding(fileName)
            ? $"filename*=UTF-8''{Uri.EscapeDataString(fileName)}"
            : $"filename=\"{fileName}\"";

    private static bool NeedsExactEncoding(string name) =>
        name.Trim() != name || name.Any(c => c is '"' or '\\' || char.IsControl(c) || c is >= '‪' and <= '‮' or >= '⁦' and <= '⁩');
}

/// <summary>Calls on the test routes. Nothing asserts unless the name says so.</summary>
public static class AttachmentRequests
{
    public static Task<HttpResponseMessage> UploadAsync(this ApiClient client, string url, string fileName, byte[] bytes,
        string declaredType = "application/octet-stream") =>
        client.SendAsync(new HttpRequestMessage(HttpMethod.Post, url) { Content = MultipartBody.Of(fileName, bytes, declaredType) });

    public static Task<HttpResponseMessage> ReplaceAsync(this ApiClient client, string url, string fileName, byte[] bytes) =>
        client.SendAsync(new HttpRequestMessage(HttpMethod.Put, url) { Content = MultipartBody.Of(fileName, bytes) });

    /// <summary>Asserts 200 and reads the stored file.</summary>
    public static async Task<AttachmentDto> ShouldBeStoredAsync(this HttpResponseMessage response)
    {
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<AttachmentDto>();
    }

    /// <summary>Uploads (asserts 200).</summary>
    public static async Task<AttachmentDto> StoredAsync(this ApiClient client, string url, string fileName, byte[] bytes) =>
        await (await client.UploadAsync(url, fileName, bytes)).ShouldBeStoredAsync();

    /// <summary>The list (asserts 200).</summary>
    public static async Task<List<AttachmentDto>> ListedAsync(this ApiClient client, string url)
    {
        var response = await client.GetAsync(url);
        await response.ShouldBeOkAsync();
        return await response.ReadAsync<List<AttachmentDto>>();
    }

    /// <summary>A download's bytes (asserts 200).</summary>
    public static async Task<byte[]> DownloadedAsync(this ApiClient client, string url)
    {
        var response = await client.GetAsync(url);
        await response.ShouldBeOkAsync();
        return await response.Content.ReadAsByteArrayAsync();
    }

    public static void ShouldBeTheBytes(this byte[] actual, byte[] expected) =>
        Convert.ToHexString(SHA256.HashData(actual)).ShouldBe(Convert.ToHexString(SHA256.HashData(expected)), $"{actual.Length} bytes, expected {expected.Length}");
}
