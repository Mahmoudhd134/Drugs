using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Application.Common.Settings;

namespace ClinicHub.Application.Features.Identity.Login.Queries.GetOtpMode;

internal sealed class GetOtpModeQueryHandler(OtpSettings otp) : IQueryHandler<GetOtpModeQuery, OtpModeResponse>
{
    public Task<Result<OtpModeResponse>> Handle(GetOtpModeQuery query, CancellationToken cancellationToken) =>
        Task.FromResult<Result<OtpModeResponse>>(new OtpModeResponse(otp.Mode));
}
