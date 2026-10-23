using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Platform.DrugCategories.Commands.DeleteSubCategory;

/// <summary>Order: 404 → <c>subCategoryInUse</c> (a <c>CountError</c>). Real delete; the category row is untouched.</summary>
public record DeleteSubCategoryCommand(int Id) : ICommand;
