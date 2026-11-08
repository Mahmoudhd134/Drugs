using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Messaging;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Forms.Definitions.Queries.GetForm;

internal sealed class GetFormQueryHandler(IAppDbContext db) : IQueryHandler<GetFormQuery, FormDetails>
{
    public async Task<Result<FormDetails>> Handle(GetFormQuery query, CancellationToken cancellationToken)
    {
        var form = await db.Forms.AsNoTracking().NotDeleted()
            .Where(f => f.Id == query.Id)
            .Select(f => new
            {
                f.Id,
                f.Name,
                f.ActiveVersionNumber,
                f.UpdatedAt,
                Definition = f.Versions
                    .Where(v => v.VersionNumber == f.ActiveVersionNumber)
                    .Select(v => v.Definition)
                    .First(),
            })
            .FirstOrDefaultAsync(cancellationToken);
        if (form is null)
            return FormErrors.NotFound;

        return new FormDetails(form.Id, form.Name, form.ActiveVersionNumber, form.UpdatedAt,
            FormDefinitionJson.Parse(form.Definition));
    }
}
