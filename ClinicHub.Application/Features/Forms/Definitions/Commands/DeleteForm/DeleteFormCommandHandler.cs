using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.DeleteForm;

internal sealed class DeleteFormCommandHandler(IAppDbContext db, TimeProvider clock) : ICommandHandler<DeleteFormCommand>
{
    public async Task<Result> Handle(DeleteFormCommand command, CancellationToken cancellationToken)
    {
        var form = await db.Forms.NotDeleted().FirstOrDefaultAsync(f => f.Id == command.Id, cancellationToken);
        if (form is null)
            return FormErrors.NotFound;

        form.Delete(clock.GetUtcNow().UtcDateTime);
        await db.SaveChangesAsync(cancellationToken);
        return Result.Success();
    }
}
