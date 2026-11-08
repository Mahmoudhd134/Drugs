using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Forms;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.CreateForm;

internal sealed class CreateFormCommandHandler(IAppDbContext db) : ICommandHandler<CreateFormCommand, FormDetails>
{
    private const int FirstVersionNumber = 1;

    public async Task<Result<FormDetails>> Handle(CreateFormCommand command, CancellationToken cancellationToken)
    {
        // Stored as sent (contract § 3); the validator checked the shell
        var definition = command.Definition.Value.GetRawText();
        var form = new Form
        {
            Name = command.Name.Trim(),
            ActiveVersionNumber = FirstVersionNumber,
            Versions = [new FormVersion { VersionNumber = FirstVersionNumber, Definition = definition }],
        };

        db.Forms.Add(form);
        await db.SaveChangesAsync(cancellationToken);

        return new FormDetails(form.Id, form.Name, form.ActiveVersionNumber, form.UpdatedAt,
            FormDefinitionJson.Parse(definition));
    }
}
