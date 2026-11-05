using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using ClinicHub.IntegrationTests.Harness.Hosting;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.AspNetCore.Server.Kestrel.Transport.Sockets;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace ClinicHub.IntegrationTests.Attachments.TestHost;

/// <summary>
/// The same app behind a real Kestrel on <c>127.0.0.1</c>, port 0, for what TestServer can't prove: it enforces no body limit
/// (docs/design/attachments.md § 8). Opt-in and self-contained: nothing else in the suite uses it.
/// <para>
/// How: <c>WebApplicationFactory</c> casts the host's server to <c>TestServer</c>, and swapping it means running <c>Program</c> twice on one
/// database. So a variant app boots as usual, once, a startup filter keeps the request pipeline it builds, and a <see cref="KestrelServer"/> serves
/// that same pipeline, with the same services, with Kestrel's real connection features and default limits. Log in through
/// <c>Login.On(Variant)</c> and send the request with <see cref="CreateClient"/> or <see cref="SendChunkedAsync"/>.
/// </para>
/// </summary>
public sealed class RealKestrelHost : IAsyncDisposable
{
    private readonly KestrelServer server;

    private RealKestrelHost(ClinicHubFactory variant, KestrelServer server, Uri address)
    {
        Variant = variant;
        this.server = server;
        Address = address;
    }

    public ClinicHubFactory Variant { get; }
    public Uri Address { get; }

    public static async Task<RealKestrelHost> StartAsync(AttachmentsAppFixture app, IReadOnlyDictionary<string, string> settings = null)
    {
        var pipeline = new PipelineCapture();
        var variant = app.CreateHostVariant(settings, services => services.AddSingleton<IStartupFilter>(pipeline));
        try
        {
            variant.Start();
            var services = variant.Services;
            var options = new KestrelServerOptions { ApplicationServices = services };
            options.Listen(IPAddress.Loopback, 0);
            var logging = services.GetRequiredService<ILoggerFactory>();
            var kestrel = new KestrelServer(Options.Create(options),
                new SocketTransportFactory(Options.Create(new SocketTransportOptions()), logging), logging);
            await kestrel.StartAsync(new PipelineApplication(pipeline.Built, services.GetRequiredService<IHttpContextFactory>()), CancellationToken.None);
            return new RealKestrelHost(variant, kestrel, new Uri(kestrel.Features.GetRequiredFeature<IServerAddressesFeature>().Addresses.Single()));
        }
        catch
        {
            await variant.DisposeAsync();
            throw;
        }
    }

    /// <summary>A real socket client on this host, sending <paramref name="accessToken"/>. No retries, no proxy.</summary>
    public HttpClient CreateClient(string accessToken)
    {
        var client = new HttpClient(new SocketsHttpHandler { UseProxy = false, AllowAutoRedirect = false })
        {
            BaseAddress = Address,
            Timeout = TimeSpan.FromMinutes(2),
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }

    /// <summary>
    /// A real chunked request with no <c>Content-Length</c>, on a raw socket: <paramref name="head"/>, then <paramref name="fileBytes"/> in small chunks,
    /// never the closing boundary or the last chunk, with the connection left open while the answer is awaited. <c>HttpClient</c> can't do this
    /// reliably on HTTP/1.1: it holds an early response until its body is sent, and a server that stops reading breaks that send. Returns the
    /// status, the content type and the decoded body.
    /// </summary>
    public async Task<HttpResponseMessage> SendChunkedAsync(string path, string accessToken, string contentType, byte[] head, long fileBytes)
    {
        using var tcp = new TcpClient();
        await tcp.ConnectAsync(Address.Host, Address.Port);
        var stream = tcp.GetStream();
        await stream.WriteAsync(Encoding.ASCII.GetBytes(
            $"POST {path} HTTP/1.1\r\nHost: {Address.Authority}\r\nAuthorization: Bearer {accessToken}\r\nContent-Type: {contentType}\r\nTransfer-Encoding: chunked\r\n\r\n"));

        var answer = ReadResponseAsync(stream);
        try
        {
            await WriteChunkAsync(stream, head);
            var chunk = FileSamples.Png(64 * 1024);
            for (long sent = 0; sent < fileBytes && !answer.IsCompleted; sent += chunk.Length)
                await WriteChunkAsync(stream, chunk);
        }
        catch (IOException)
        {
            // The server may close the connection once it has answered: the test looks at the answer
        }
        return await answer.WaitAsync(TimeSpan.FromMinutes(1));
    }

    private static async Task WriteChunkAsync(Stream stream, byte[] chunk)
    {
        await stream.WriteAsync(Encoding.ASCII.GetBytes($"{chunk.Length:x}\r\n"));
        await stream.WriteAsync(chunk);
        await stream.WriteAsync("\r\n"u8.ToArray());
    }

    /// <summary>Reads one HTTP/1.1 response, with a <c>Content-Length</c> or chunked, as soon as it's complete.</summary>
    private static async Task<HttpResponseMessage> ReadResponseAsync(Stream stream)
    {
        var received = new MemoryStream();
        var buffer = new byte[16 * 1024];
        while (true)
        {
            if (TryParseResponse(received.ToArray()) is { } response)
                return response;
            var read = await stream.ReadAsync(buffer);
            if (read == 0)
                throw new IOException($"The server closed the connection before a whole response: {Encoding.UTF8.GetString(received.ToArray())}");
            received.Write(buffer, 0, read);
        }
    }

    private static HttpResponseMessage TryParseResponse(byte[] bytes)
    {
        var text = Encoding.Latin1.GetString(bytes);
        var headersEnd = text.IndexOf("\r\n\r\n", StringComparison.Ordinal);
        if (headersEnd < 0)
            return null;
        var lines = text[..headersEnd].Split("\r\n");
        var status = int.Parse(lines[0].Split(' ')[1], CultureInfo.InvariantCulture);
        var headers = lines.Skip(1).Select(line => line.Split(':', 2)).ToDictionary(p => p[0].Trim(), p => p[1].Trim(), StringComparer.OrdinalIgnoreCase);
        var bodyStart = headersEnd + 4;

        byte[] body;
        if (headers.TryGetValue("Content-Length", out var length))
        {
            var size = int.Parse(length, CultureInfo.InvariantCulture);
            if (bytes.Length - bodyStart < size)
                return null;
            body = bytes[bodyStart..(bodyStart + size)];
        }
        else if (headers.TryGetValue("Transfer-Encoding", out var encoding) && encoding.Contains("chunked", StringComparison.OrdinalIgnoreCase))
        {
            var decoded = new MemoryStream();
            var at = bodyStart;
            while (true)
            {
                var lineEnd = text.IndexOf("\r\n", at, StringComparison.Ordinal);
                if (lineEnd < 0)
                    return null;
                var size = Convert.ToInt32(text[at..lineEnd], 16);
                if (size == 0)
                    break;
                if (bytes.Length < lineEnd + 2 + size + 2)
                    return null;
                decoded.Write(bytes, lineEnd + 2, size);
                at = lineEnd + 2 + size + 2;
            }
            body = decoded.ToArray();
        }
        else
        {
            body = [];
        }

        var response = new HttpResponseMessage((HttpStatusCode)status) { Content = new ByteArrayContent(body) };
        if (headers.TryGetValue("Content-Type", out var contentType))
            response.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(contentType);
        return response;
    }

    public async ValueTask DisposeAsync()
    {
        using (var stop = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
            await server.StopAsync(stop.Token);
        server.Dispose();
        await Variant.DisposeAsync();
    }

    /// <summary>Keeps the app's whole pipeline. Building it twice only creates the middleware twice: each holds no state of its own here.</summary>
    private sealed class PipelineCapture : IStartupFilter
    {
        public RequestDelegate Built { get; private set; }

        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            next(app);
            Built = app.Build();
        };
    }

    private sealed class PipelineApplication(RequestDelegate pipeline, IHttpContextFactory contexts) : IHttpApplication<HttpContext>
    {
        public HttpContext CreateContext(IFeatureCollection contextFeatures) => contexts.Create(contextFeatures);

        public Task ProcessRequestAsync(HttpContext context) => pipeline(context);

        public void DisposeContext(HttpContext context, Exception exception) => contexts.Dispose(context);
    }
}
