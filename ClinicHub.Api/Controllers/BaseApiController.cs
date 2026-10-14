using ClinicHub.Api.Errors;
using ClinicHub.Api.Features.Access;
using ClinicHub.Api.Shared;
using Microsoft.AspNetCore.Mvc;

namespace ClinicHub.Api.Controllers;

[ApiController]
[Route("api/v1/[controller]")]
public class BaseApiController : ControllerBase
{
    /// <summary>
    /// A ProblemDetails carrying an <see cref="ErrorCodes"/> value in "code", for the controllers that
    /// do not send use cases yet (login; Phase 3.5 step 3). Use cases return a Result instead.
    /// </summary>
    protected ObjectResult ApiError(string code, int statusCode = StatusCodes.Status400BadRequest)
    {
        // Access codes have their own descriptions; the others get their status's until step 3
        var error = statusCode == StatusCodes.Status403Forbidden
            ? AccessProblem.ToError(code)
            : ApiProblemFactory.ErrorForStatus(statusCode) with { Code = code };
        return ApiProblemFactory.ToActionResult(ApiProblemFactory.Create(HttpContext, error, statusCode));
    }
}
