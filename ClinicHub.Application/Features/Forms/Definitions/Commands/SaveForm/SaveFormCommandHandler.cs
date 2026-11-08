using System.Text.Json;
using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using ClinicHub.Domain.Forms;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.SaveForm;

/// <summary>
/// Contract § 3. Two saves racing on the "used" path: the second answers 500 <c>unexpected</c> (the primary key refuses the
/// same number), a documented near-impossible case. Otherwise the last write wins.
/// </summary>
internal sealed class SaveFormCommandHandler(IAppDbContext db, IFormUsage usage)
    : ICommandHandler<SaveFormCommand, FormDetails>
{
    public async Task<Result<FormDetails>> Handle(SaveFormCommand command, CancellationToken cancellationToken)
    {
        var form = await db.Forms.NotDeleted().FirstOrDefaultAsync(f => f.Id == command.Id, cancellationToken);
        if (form is null)
            return FormErrors.NotFound;

        var active = await db.FormVersions.FirstAsync(
            v => v.FormId == form.Id && v.VersionNumber == form.ActiveVersionNumber, cancellationToken);

        form.Name = command.Name.Trim();

        var sent = command.Definition.Value;
        var definition = active.Definition;
        if (!IsSameDefinition(definition, sent))
        {
            definition = sent.GetRawText();
            if (await usage.IsUsedAsync(form.Id, cancellationToken))
                await AddActiveVersionAsync(form, definition, cancellationToken);
            else
                active.Definition = definition;
        }

        // The list's "last edited" moves even when only the version changed, or nothing did
        db.Touch(form);
        await db.SaveChangesAsync(cancellationToken);

        return new FormDetails(form.Id, form.Name, form.ActiveVersionNumber, form.UpdatedAt,
            FormDefinitionJson.Parse(definition));
    }

    private static bool IsSameDefinition(string stored, JsonElement sent)
    {
        using var document = JsonDocument.Parse(stored);
        return JsonElement.DeepEquals(document.RootElement, sent);
    }

    private async Task AddActiveVersionAsync(Form form, string definition, CancellationToken cancellationToken)
    {
        var highest = await db.FormVersions.Where(v => v.FormId == form.Id)
            .MaxAsync(v => v.VersionNumber, cancellationToken);
        var next = highest + 1;
        db.FormVersions.Add(new FormVersion { FormId = form.Id, VersionNumber = next, Definition = definition });
        form.ActiveVersionNumber = next;
    }
}
