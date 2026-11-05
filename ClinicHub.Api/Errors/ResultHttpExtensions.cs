using System.Globalization;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Features.Attachments.Files;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Errors;

/// <summary>
/// <see cref="Result"/> → HTTP, in one place. Success is plain data (200 + JSON, 201 + JSON, 204);
/// a failure is always a ProblemDetails from <see cref="ApiProblemFactory"/>.
/// </summary>
public static class ResultHttpExtensions
{
    public static ActionResult ToOk<TData>(this Result<TData> result) =>
        result.IsSuccess ? new OkObjectResult(result.Data) : result.ToProblem();

    /// <param name="actionName">The action that reads the created resource (its URL goes in <c>Location</c>).</param>
    /// <param name="routeValues">That action's route values, from the data (e.g. <c>d => new { id = d.Id }</c>).</param>
    public static ActionResult ToCreated<TData>(this Result<TData> result, string actionName,
        Func<TData, object> routeValues) =>
        result.IsSuccess
            ? new CreatedAtActionResult(actionName, null, routeValues(result.Data), result.Data)
            : result.ToProblem();

    public static ActionResult ToNoContent(this Result result) =>
        result.IsSuccess ? new NoContentResult() : result.ToProblem();

    public static ActionResult ToProblem(this Result result) => new ProblemResult(result.Errors);

    /// <summary>
    /// A feature's download (docs/design/attachments.md § 7): the file streamed, not loaded, with its checked <c>Content-Type</c>, always
    /// <c>Content-Disposition: attachment</c> (<c>filename*</c> for non-ASCII names), <c>X-Content-Type-Options: nosniff</c> and
    /// <c>Cache-Control: private, no-store</c>. A failure is the usual ProblemDetails, without those headers.
    /// </summary>
    public static ActionResult ToFile(this Result<AttachmentContent> result) =>
        result.IsSuccess ? new AttachmentFileResult(result.Data) : result.ToProblem();

    /// <summary>Adds its two headers when executed, when the <see cref="HttpContext"/> is known; the framework streams the file and disposes it.</summary>
    private sealed class AttachmentFileResult : FileStreamResult
    {
        public AttachmentFileResult(AttachmentContent content) : base(content.Content, content.ContentType) =>
            FileDownloadName = content.OriginalFileName;

        public override Task ExecuteResultAsync(ActionContext context)
        {
            var headers = context.HttpContext.Response.Headers;
            headers.XContentTypeOptions = "nosniff";
            headers.CacheControl = "private, no-store";
            return base.ExecuteResultAsync(context);
        }
    }

    /// <summary>
    /// Builds the problem when executed, when the <see cref="HttpContext"/> is known. A
    /// <see cref="TooManyRequestsError"/> also sets <c>Retry-After</c> (seconds).
    /// </summary>
    private sealed class ProblemResult(IReadOnlyList<Error> errors) : ActionResult
    {
        public override Task ExecuteResultAsync(ActionContext context)
        {
            if (errors[0] is TooManyRequestsError tooMany)
                context.HttpContext.Response.Headers.RetryAfter =
                    tooMany.RetryAfterSeconds.ToString(CultureInfo.InvariantCulture);
            return ApiProblemFactory.ToActionResult(ApiProblemFactory.Create(context.HttpContext, errors))
                .ExecuteResultAsync(context);
        }
    }
}
