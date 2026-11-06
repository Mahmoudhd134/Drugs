using System.Text;
using System.Text.Json;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Features.Attachments;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments.Files;
using ClinicHub.UnitTests.Attachments.Files;
using ClinicHub.UnitTests.Attachments.Providers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Shouldly;

namespace ClinicHub.UnitTests.Attachments.UploadFilter;

/// <summary>
/// <c>[AttachmentUpload(module)]</c> owns the form read (docs/design/attachments.md § 5). M = <c>clinicPaper</c> (2 MB), G = any other module
/// (20 MB). The real 401, 403 and body limits are the <c>api</c> cases: here, a body that throws when read proves it stays unread.
/// </summary>
[Trait("Area", "attachments")]
public class AttachmentUploadFilterTests
{
    private const string M = AttachmentModules.ClinicPaper;
    private const string G = "anyOtherModule";
    private const long LimitOfM = 2 * 1_048_576;
    private const long LimitOfG = 20 * 1_048_576;
    private const string Boundary = "----attachment-boundary";

    private static readonly IServiceProvider Mvc = new ServiceCollection().AddLogging().AddControllers().Services.BuildServiceProvider();

    /// <summary>Any read of the body is the failure.</summary>
    private sealed class UnreadableBody : Stream
    {
        public bool Touched { get; private set; }

        private Exception Read()
        {
            Touched = true;
            return new InvalidOperationException("The body was read.");
        }

        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => throw Read();
        public override int Read(Span<byte> buffer) => throw Read();
        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct) => throw Read();
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default) => throw Read();
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
    }

    private sealed class BodySizeFeature : IHttpMaxRequestBodySizeFeature
    {
        public bool IsReadOnly => false;
        public long? MaxRequestBodySize { get; set; } = 30_000_000;
    }

    private sealed record Run(ResourceExecutingContext Context, DefaultHttpContext Http)
    {
        public bool NextCalled { get; set; }
    }

    private static DefaultHttpContext Request(Stream body, long? contentLength)
    {
        var http = new DefaultHttpContext { RequestServices = Mvc };
        http.Request.Method = "POST";
        http.Request.ContentType = $"multipart/form-data; boundary={Boundary}";
        http.Request.ContentLength = contentLength;
        http.Request.Body = body;
        http.Response.Body = new MemoryStream();
        return http;
    }

    private static async Task<Run> RunFilter(string module, DefaultHttpContext http)
    {
        var filter = new AttachmentUploadFilter(module, AttachmentServiceHarness.DesignSettings());
        var action = new ActionContext(http, new RouteData(), new ActionDescriptor { DisplayName = "Test.Upload" });
        var context = new ResourceExecutingContext(action, new List<IFilterMetadata>(), new List<IValueProviderFactory>());
        var run = new Run(context, http);

        await filter.OnResourceExecutionAsync(context, () =>
        {
            run.NextCalled = true;
            return Task.FromResult(new ResourceExecutedContext(context, context.Filters));
        });

        return run;
    }

    /// <summary>What the client would get: the filter's result, really executed.</summary>
    private static async Task<(int Status, string Code)> AnswerOf(Run run)
    {
        run.Context.Result.ShouldNotBeNull("the filter refused with no result");
        await run.Context.Result.ExecuteResultAsync(run.Context);
        var body = (MemoryStream)run.Http.Response.Body;
        using var json = JsonDocument.Parse(body.ToArray());
        return (run.Http.Response.StatusCode, json.RootElement.GetProperty("code").GetString());
    }

    private static MemoryStream OneFilePart(int fileBytes = 16)
    {
        var head = Encoding.ASCII.GetBytes(
            $"--{Boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n");
        var tail = Encoding.ASCII.GetBytes($"\r\n--{Boundary}--\r\n");
        var body = new MemoryStream();
        body.Write(head);
        body.Write(new byte[fileBytes]);
        body.Write(tail);
        body.Position = 0;
        return body;
    }

    // ---- ATT-081: a Content-Length past the limit ----

    [Theory]
    [Trait("Case", "ATT-081")]
    [Trait("Case", "ATT-010")]
    [InlineData(M, 10L * 1024 * 1024 * 1024)]
    [InlineData(G, 10L * 1024 * 1024 * 1024)]
    [InlineData(M, long.MaxValue)]
    public async Task A_content_length_far_past_the_limit_answers_too_large_with_the_body_unread_and_no_next(string module, long contentLength)
    {
        var body = new UnreadableBody();

        var run = await RunFilter(module, Request(body, contentLength));

        run.NextCalled.ShouldBeFalse();
        body.Touched.ShouldBeFalse();
        var (status, code) = await AnswerOf(run);
        status.ShouldBe(400);
        code.ShouldBe("attachmentTooLarge");
    }

    [Theory]
    [Trait("Case", "ATT-081")]
    [InlineData(M, LimitOfM)]
    [InlineData(G, LimitOfG)]
    public async Task One_byte_past_the_limit_and_its_framing_allowance_is_refused_unread(string module, long limit)
    {
        var body = new UnreadableBody();

        var run = await RunFilter(module, Request(body, limit + AttachmentUploadFilter.FramingAllowanceBytes + 1));

        run.NextCalled.ShouldBeFalse();
        body.Touched.ShouldBeFalse();
        (await AnswerOf(run)).Code.ShouldBe("attachmentTooLarge");
    }

    [Fact]
    [Trait("Case", "ATT-081")]
    public void The_framing_allowance_is_64_kb()
    {
        AttachmentUploadFilter.FramingAllowanceBytes.ShouldBe(65_536);
    }

    [Theory]
    [Trait("Case", "ATT-081")]
    [InlineData(M, LimitOfM)]
    [InlineData(G, LimitOfG)]
    public async Task A_content_length_at_the_limit_and_its_framing_allowance_goes_on_with_the_form_read(string module, long limit)
    {
        var run = await RunFilter(module, Request(OneFilePart(), limit + AttachmentUploadFilter.FramingAllowanceBytes));

        run.Context.Result.ShouldBeNull();
        run.NextCalled.ShouldBeTrue();
        run.Http.Request.Form.Files.Count.ShouldBe(1);
    }

    [Fact]
    [Trait("Case", "ATT-081")]
    public async Task The_limit_is_the_modules_own_a_size_over_M_passes_in_G()
    {
        var contentLength = LimitOfM + AttachmentUploadFilter.FramingAllowanceBytes + 1;

        (await RunFilter(G, Request(OneFilePart(), contentLength))).NextCalled.ShouldBeTrue();
        (await RunFilter(M, Request(OneFilePart(), contentLength))).NextCalled.ShouldBeFalse();
    }

    [Theory]
    [Trait("Case", "ATT-081")]
    [InlineData(M, LimitOfM)]
    [InlineData(G, LimitOfG)]
    public async Task The_servers_body_limit_is_set_to_the_modules_limit_and_its_framing_allowance(string module, long limit)
    {
        var http = Request(OneFilePart(), 1000);
        var feature = new BodySizeFeature();
        http.Features.Set<IHttpMaxRequestBodySizeFeature>(feature);

        var run = await RunFilter(module, http);

        run.NextCalled.ShouldBeTrue();
        feature.MaxRequestBodySize.ShouldBe(limit + AttachmentUploadFilter.FramingAllowanceBytes);
    }

    [Fact]
    [Trait("Case", "ATT-081")]
    public async Task A_body_past_the_limit_with_no_content_length_answers_too_large_not_invalid_request()
    {
        using var body = OneFilePart(fileBytes: (int)(LimitOfM + AttachmentUploadFilter.FramingAllowanceBytes + 1024));

        var run = await RunFilter(M, Request(body, contentLength: null));

        run.NextCalled.ShouldBeFalse();
        var (status, code) = await AnswerOf(run);
        status.ShouldBe(400);
        code.ShouldBe("attachmentTooLarge");
    }

    // ---- ATT-185: a server's failure during the form read isn't the client's fault ----

    private static byte[] FirstBytesOfAFilePart() => OneFilePart().ToArray()[..^($"\r\n--{Boundary}--\r\n".Length)];

    [Theory]
    [Trait("Case", "ATT-185")]
    [InlineData("No space left on device")]
    [InlineData("There is not enough space on the disk.")]
    public async Task A_form_read_failing_on_a_full_disk_goes_on_to_the_unexpected_handler_not_400(string message)
    {
        var failure = new IOException(message);
        var content = FirstBytesOfAFilePart();
        var http = Request(new StreamThrowingAfter(content, content.Length, failure), content.Length);

        var thrown = await Should.ThrowAsync<Exception>(() => RunFilter(M, http));

        thrown.ShouldBeSameAs(failure);
    }

    [Fact]
    [Trait("Case", "ATT-185")]
    public async Task A_form_read_failing_on_an_unusable_temp_folder_goes_on_to_the_unexpected_handler_not_400()
    {
        var failure = new DirectoryNotFoundException("Could not find a part of the path.");
        var content = FirstBytesOfAFilePart();
        var http = Request(new StreamThrowingAfter(content, content.Length, failure), content.Length);

        var thrown = await Should.ThrowAsync<Exception>(() => RunFilter(M, http));

        thrown.ShouldBeSameAs(failure);
    }

    [Fact]
    [Trait("Case", "ATT-185")]
    public async Task A_missing_closing_boundary_is_the_clients_and_still_answers_invalid_request()
    {
        using var body = new MemoryStream(FirstBytesOfAFilePart());

        var run = await RunFilter(M, Request(body, body.Length));

        run.NextCalled.ShouldBeFalse();
        var (status, code) = await AnswerOf(run);
        status.ShouldBe(400);
        code.ShouldBe("invalidRequest");
    }

    [Fact]
    [Trait("Case", "ATT-185")]
    public async Task A_request_body_cut_short_is_the_clients_and_still_answers_invalid_request()
    {
        var content = FirstBytesOfAFilePart();
        var cutShort = new BadHttpRequestException("Unexpected end of request content.", StatusCodes.Status400BadRequest);
        var http = Request(new StreamThrowingAfter(content, content.Length, cutShort), content.Length + 1000);

        var run = await RunFilter(M, http);

        run.NextCalled.ShouldBeFalse();
        var (status, code) = await AnswerOf(run);
        status.ShouldBe(400);
        code.ShouldBe("invalidRequest");
    }

    // ---- ATT-186: only the module's own limit means too large ----

    /// <summary>A file part framed by another boundary than the header's, so all of it is preamble to the form reader.</summary>
    private static MemoryStream WrongBoundaryBody(int fileBytes)
    {
        var body = new MemoryStream();
        body.Write(Encoding.ASCII.GetBytes(
            "--not-the-header-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.png\"\r\nContent-Type: image/png\r\n\r\n"));
        body.Write(new byte[fileBytes]);
        body.Write(Encoding.ASCII.GetBytes("\r\n--not-the-header-boundary--\r\n"));
        body.Position = 0;
        return body;
    }

    [Theory]
    [Trait("Case", "ATT-186")]
    [InlineData(M, 10 * 1024, true)]
    [InlineData(M, 17 * 1024, true)]
    [InlineData(M, 17 * 1024, false)]
    [InlineData(M, 100 * 1024, true)]
    [InlineData(M, 100 * 1024, false)]
    [InlineData(M, 1024 * 1024, true)]
    [InlineData(G, 100 * 1024, true)]
    [InlineData(G, 100 * 1024, false)]
    public async Task A_wrong_boundary_within_the_modules_limit_answers_invalid_request_whatever_the_preambles_size(string module, int fileBytes, bool withContentLength)
    {
        using var body = WrongBoundaryBody(fileBytes);
        body.Length.ShouldBeLessThan(LimitOfM);

        var run = await RunFilter(module, Request(body, withContentLength ? body.Length : null));

        run.NextCalled.ShouldBeFalse();
        var (status, code) = await AnswerOf(run);
        status.ShouldBe(400);
        code.ShouldBe("invalidRequest");
    }

    // ---- ATT-010: only as far as a unit test can; the api part proves the 403 ----

    [Fact]
    [Trait("Case", "ATT-010")]
    public void The_upload_attribute_builds_the_filter_with_its_module()
    {
        var attribute = new AttachmentUploadAttribute(M);

        attribute.ImplementationType.ShouldBe(typeof(AttachmentUploadFilter));
        attribute.Arguments.ShouldBe([M]);
    }

    [Fact]
    [Trait("Case", "ATT-010")]
    public void The_filter_is_a_resource_filter_and_never_an_authorization_one_so_it_runs_after_authorization_and_before_model_binding()
    {
        var kinds = typeof(AttachmentUploadFilter).GetInterfaces();

        kinds.ShouldContain(typeof(IAsyncResourceFilter));
        kinds.ShouldNotContain(typeof(IAuthorizationFilter));
        kinds.ShouldNotContain(typeof(IAsyncAuthorizationFilter));
    }

    [Fact]
    [Trait("Case", "ATT-010")]
    public void A_permission_is_authorization_data_read_by_the_middleware_before_any_filter()
    {
        typeof(HasPermissionAttribute).GetInterfaces().ShouldContain(typeof(IAuthorizeData));
        typeof(IFilterMetadata).IsAssignableFrom(typeof(HasPermissionAttribute)).ShouldBeFalse();
    }
}
