using ClinicHub.Application.Common.Settings;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

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
/// </summary>
public sealed class AttachmentUploadFilter(string module, AttachmentSettings settings) : IAsyncResourceFilter
{
    /// <summary>What the multipart framing may add on top of the file.</summary>
    public const long FramingAllowanceBytes = 64 * 1024;

    public Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next) =>
        throw new NotImplementedException();
}
