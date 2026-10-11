namespace Drags.Api.Shared;

/// <summary>Filled automatically (UTC) when the row is saved.</summary>
public interface IHasTimestamps
{
    DateTime CreatedAt { get; set; }
    DateTime UpdatedAt { get; set; }
}
