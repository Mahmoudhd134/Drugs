using System.Runtime.CompilerServices;
using System.Text.Json;
using ClinicHub.Application.Features.Forms.Definitions;
using ClinicHub.Application.Features.Forms.Definitions.Commands.CreateForm;
using ClinicHub.Application.Features.Forms.Definitions.Commands.DeleteForm;
using ClinicHub.IntegrationTests.Harness.Assertions;
using ClinicHub.IntegrationTests.Harness.Hosting;

namespace ClinicHub.IntegrationTests.Harness.Builders;

/// <summary>
/// <c>CreateFormCommand</c> as the super admin (no clinic). Default: a unique name and an empty definition; the server
/// never reads inside it (design dynamic-forms D4), so any JSON object fits.
/// </summary>
public sealed class FormBuilder(AppFixture app)
{
    private const string EmptyDefinition = """{"schemaVersion":1,"dir":"rtl","nodes":[]}""";

    private string name = Unique.Name("Form", "نموذج");
    private string definition = EmptyDefinition;
    private bool deleted;

    public FormBuilder Named(string value) { name = value; return this; }

    /// <param name="json">The definition's JSON text.</param>
    public FormBuilder WithDefinition(string json) { definition = json; return this; }

    /// <summary>Soft deleted after creation (<c>DeleteFormCommand</c>).</summary>
    public FormBuilder Deleted() { deleted = true; return this; }

    public async Task<FormDetails> CreateAsync()
    {
        using var document = JsonDocument.Parse(definition);
        var form = (await app.SendAsync(new CreateFormCommand(name, document.RootElement.Clone()))).ShouldSucceed();
        if (deleted)
            (await app.SendAsync(new DeleteFormCommand(form.Id))).ShouldSucceed();
        return form;
    }

    public TaskAwaiter<FormDetails> GetAwaiter() => CreateAsync().GetAwaiter();
}
