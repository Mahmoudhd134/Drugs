using ClinicHub.Api.Shared;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class BaseApiController : ControllerBase
{
    private const int MaxPageSize = 100;

    /// <summary>A ProblemDetails response carrying an <see cref="ErrorCodes"/> value in "code".</summary>
    protected ObjectResult ApiError(string code, int statusCode = StatusCodes.Status400BadRequest)
    {
        var problem = new ProblemDetails { Status = statusCode, Title = code };
        problem.Extensions["code"] = code;
        return StatusCode(statusCode, problem);
    }

    protected static (int Page, int PageSize) NormalizePaging(int page, int pageSize) =>
        (Math.Max(page, 1), Math.Clamp(pageSize, 1, MaxPageSize));
}
