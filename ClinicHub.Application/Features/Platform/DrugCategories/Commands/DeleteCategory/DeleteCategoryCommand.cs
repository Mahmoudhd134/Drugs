using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteCategory;

/// <summary>
/// Order (§ 7): 404 → <c>categoryInUse</c> (a <c>CountError</c>: every drug in it, shared, withdrawn, every clinic's own,
/// deleted clinics included). Deletes its (empty) subcategories with it. Real delete.
/// </summary>
public record DeleteCategoryCommand(int Id) : ICommand;
