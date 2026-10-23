using ClinicHub.Application.Common.Abstractions;
using ClinicHub.Application.Common.Results;
using Microsoft.EntityFrameworkCore;

namespace ClinicHub.Application.Features.Platform.Clinics;

/// <inheritdoc />
/// <remarks>
/// Here, not next to <see cref="IClinicScope"/> in <c>Common/Abstractions</c>: it needs the Platform clinic rules
/// (<see cref="ClinicQueries.Manageable"/>, <see cref="ClinicErrors"/>), and Common never references Features.
/// </remarks>
internal sealed class ClinicScope(IAppDbContext db, ClinicContext clinicContext) : IClinicScope
{
    public async Task<Result> EnterAsync(int clinicId, CancellationToken cancellationToken = default)
    {
        ThrowIfWritingSharedCatalog(clinicId);

        // Checked first, also when the clinic is already set (e.g. by Use): never a success for the template
        if (!await db.Clinics.AsNoTracking().Manageable().AnyAsync(c => c.Id == clinicId, cancellationToken))
            return ClinicErrors.NotFound;

        if (clinicContext.ClinicId is { } current && current != clinicId)
            throw new InvalidOperationException(
                $"Cannot enter clinic {clinicId}: the request already acts in clinic {current}.");
        clinicContext.ClinicId = clinicId;
        return Result.Success();
    }

    public IDisposable Use(int clinicId)
    {
        ThrowIfWritingSharedCatalog(clinicId);
        var previous = clinicContext.ClinicId;
        clinicContext.ClinicId = clinicId;
        return new Restore(clinicContext, previous);
    }

    public IDisposable UseSharedCatalog()
    {
        if (clinicContext.ClinicId is { } current)
            throw new InvalidOperationException(
                $"Cannot write the shared catalog: the request acts in clinic {current}.");

        // Nestable: an inner block restores true, so writing stays open until the outermost block is disposed
        var previous = clinicContext.WritingSharedCatalog;
        clinicContext.WritingSharedCatalog = true;
        return new RestoreSharedCatalog(clinicContext, previous);
    }

    private void ThrowIfWritingSharedCatalog(int clinicId)
    {
        if (clinicContext.WritingSharedCatalog)
            throw new InvalidOperationException(
                $"Cannot act in clinic {clinicId}: the request is writing the shared catalog.");
    }

    private sealed class Restore(ClinicContext clinicContext, int? previous) : IDisposable
    {
        private bool disposed;

        public void Dispose()
        {
            if (disposed)
                return;
            disposed = true;
            clinicContext.ClinicId = previous;
        }
    }

    private sealed class RestoreSharedCatalog(ClinicContext clinicContext, bool previous) : IDisposable
    {
        private bool disposed;

        public void Dispose()
        {
            if (disposed)
                return;
            disposed = true;
            clinicContext.WritingSharedCatalog = previous;
        }
    }
}
