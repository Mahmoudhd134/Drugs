using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.DeleteForm;

/// <summary><b>Stub (feature 1, T1).</b></summary>
internal sealed class DeleteFormCommandHandler : ICommandHandler<DeleteFormCommand>
{
    public Task<Result> Handle(DeleteFormCommand command, CancellationToken cancellationToken) =>
        throw new NotImplementedException("Dynamic forms feature 1, T1");
}
