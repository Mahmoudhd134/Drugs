using ClinicHub.Api.Errors;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;
using ClinicHub.Application.Features.Attachments;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Net.Http.Headers;

namespace ClinicHub.Api.Features.Attachments;

/// <summary>
/// <c>[AttachmentUpload(module)]</c> on a feature's upload action (docs/design/attachments.md § 5): the module's limit decides what the server
/// reads. A resource filter, so it runs after authorization and <c>[AdminClinic]</c> and before model binding.
/// </summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class AttachmentUploadAttribute : TypeFilterAttribute
{
    public AttachmentUploadAttribute(string module) : base(typeof(AttachmentUploadFilter)) => Arguments = [module];
}

/// <summary>
/// Owns the form read: sets the server's body limit to the module's limit plus <see cref="FramingAllowanceBytes"/> where the server has that
/// feature; refuses a larger <c>Content-Length</c> unread (400 <c>attachmentTooLarge</c>); installs its own form limit and reads the form, turning
/// a body over the limit with no <c>Content-Length</c> into <c>attachmentTooLarge</c>. A body that can't be read as one multipart form
/// (not multipart, no boundary, no closing boundary, a header past its limit) or holds more than one file part answers 400 <c>invalidRequest</c>.
/// A server failure while reading the form, such as a full disk while buffering it, goes on to the unexpected handler (logged, 500 <c>unexpected</c>).
/// </summary>
public sealed class AttachmentUploadFilter(string module, AttachmentSettings settings) : IAsyncResourceFilter
{
    /// <summary>What the multipart framing may add on top of the file.</summary>
    public const long FramingAllowanceBytes = 64 * 1024;

    /// <summary>
    /// How the framework's <see cref="InvalidDataException"/> for a multipart length limit begins: it has no type of its own, and the reader's own
    /// 16 KB limit on what comes before the first boundary uses the same words, so only the number tells this filter's limit apart. The real Kestrel
    /// case ATT-082 doesn't guard this message: Kestrel's limit is the same number and also counts the part's headers, so its 413 comes first. The unit
    /// tests of ATT-081 and ATT-186, on a real <see cref="FormFeature"/>, fail if an upgrade changes it.
    /// </summary>
    private const string BodyLengthLimitMessage = "Multipart body length limit";

    /// <summary>
    /// How the framework's plain <see cref="IOException"/> for a body with no closing boundary begins: nothing else separates it from a server's
    /// own I/O failure. ATT-094 and ATT-185 fail if an upgrade changes it.
    /// </summary>
    private const string NoClosingBoundaryMessage = "Unexpected end of Stream";

    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        var httpContext = context.HttpContext;
        var limit = settings.RulesFor(module).MaxFileSizeBytes + FramingAllowanceBytes;

        // TestServer has no such feature; it's read only once the body has been started
        if (httpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } bodySize)
            bodySize.MaxRequestBodySize = limit;

        var refusal = httpContext.Request.ContentLength > limit
            ? AttachmentErrors.TooLarge
            : await ReadFormAsync(httpContext, limit);
        if (refusal is not null)
        {
            context.Result = Result.Failure(refusal).ToProblem();
            return;
        }
        await next();
    }

    /// <summary>
    /// The refusal, or null with the form read, so model binding finds it there. A client that went away isn't answered, and a server failure
    /// isn't the client's fault: both errors go on.
    /// </summary>
    private static async Task<Error> ReadFormAsync(HttpContext httpContext, long limit)
    {
        if (!IsMultipartForm(httpContext.Request.ContentType))
            return CommonErrors.InvalidRequest;

        // The default caps at 128 MB, whatever the module's limit
        httpContext.Features.Set<IFormFeature>(new FormFeature(httpContext.Request, new FormOptions { MultipartBodyLengthLimit = limit }));
        try
        {
            var form = await httpContext.Request.ReadFormAsync(httpContext.RequestAborted);
            return form.Files.Count > 1 ? CommonErrors.InvalidRequest : null;
        }
        catch (BadHttpRequestException exception) when (exception.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            return AttachmentErrors.TooLarge;
        }
        catch (InvalidDataException exception) when (exception.Message.StartsWith($"{BodyLengthLimitMessage} {limit} exceeded", StringComparison.Ordinal))
        {
            return AttachmentErrors.TooLarge;
        }
        catch (Exception exception) when (IsMalformedBody(exception) && !httpContext.RequestAborted.IsCancellationRequested)
        {
            return CommonErrors.InvalidRequest;
        }
    }

    /// <summary>The client's bad body, as opposed to a server failure. <see cref="BadHttpRequestException"/> is an <see cref="IOException"/> too, so the order matters.</summary>
    private static bool IsMalformedBody(Exception exception) => exception switch
    {
        InvalidDataException or BadHttpRequestException => true,
        IOException => exception.Message.StartsWith(NoClosingBoundaryMessage, StringComparison.Ordinal),
        _ => false,
    };

    private static bool IsMultipartForm(string contentType) =>
        MediaTypeHeaderValue.TryParse(contentType, out var parsed)
        && parsed.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase);
}
