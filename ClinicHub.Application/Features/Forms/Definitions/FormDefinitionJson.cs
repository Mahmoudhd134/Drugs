using System.Text;
using System.Text.Json;

namespace ClinicHub.Application.Features.Forms.Definitions;

/// <summary>The outer shell of a definition (contract § 2) and reading the stored text back. Nothing here looks at the content (D4).</summary>
internal static class FormDefinitionJson
{
    /// <summary>V2: anything but a JSON object is invalid; a missing or null definition too.</summary>
    public static bool IsObject(JsonElement? definition) =>
        definition is { ValueKind: JsonValueKind.Object };

    /// <summary>
    /// V2b: false for an object the server could not read back (a lone surrogate escape, a raw byte that isn't UTF-8, a number
    /// with an exponent too large to compare). Without it the row would be written and every GET and PUT of it would answer 500.
    /// </summary>
    public static bool IsReadable(JsonElement definition)
    {
        try
        {
            _ = definition.GetRawText();
            using (var writer = new Utf8JsonWriter(Stream.Null))
                definition.WriteTo(writer);
            _ = JsonElement.DeepEquals(definition, definition);
            return true;
        }
        catch (Exception e) when (e is InvalidOperationException or ArgumentException or JsonException)
        {
            return false;
        }
    }

    /// <summary>V3: the UTF-8 bytes of the JSON text as sent, at most <see cref="FormLimits.DefinitionMaxBytes"/>.</summary>
    public static bool IsWithinLimit(JsonElement definition) =>
        Encoding.UTF8.GetByteCount(definition.GetRawText()) <= FormLimits.DefinitionMaxBytes;

    /// <summary>The stored text as a value that outlives its document, for the answer.</summary>
    public static JsonElement Parse(string storedDefinition)
    {
        using var document = JsonDocument.Parse(storedDefinition);
        return document.RootElement.Clone();
    }
}
