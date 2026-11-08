using System.Text.Json;
using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.SaveForm;

/// <summary>
/// Saves the name and the definition (design dynamic-forms § 4.2): an unchanged definition makes no version; a changed one
/// replaces the active version, or makes a new active one when the form is used.
/// </summary>
/// <param name="Definition">Null when the request had none: <see cref="FormErrors.DefinitionInvalid"/>.</param>
public record SaveFormCommand(int Id, string Name, JsonElement? Definition) : ICommand<FormDetails>;
