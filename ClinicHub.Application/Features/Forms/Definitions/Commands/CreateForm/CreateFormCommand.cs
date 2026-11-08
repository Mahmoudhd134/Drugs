using System.Text.Json;
using ClinicHub.Application.Common.Messaging;

namespace ClinicHub.Application.Features.Forms.Definitions.Commands.CreateForm;

/// <summary>A new form with version 1 active (design dynamic-forms § 4.3).</summary>
/// <param name="Definition">Null when the request had none: <see cref="FormErrors.DefinitionInvalid"/>.</param>
public record CreateFormCommand(string Name, JsonElement? Definition) : ICommand<FormDetails>;
