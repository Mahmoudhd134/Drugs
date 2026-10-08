namespace Drags.Api.Models;

public class Drug
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Description { get; set; }
    public List<DrugGroupItem> GroupItems { get; set; } = [];
}
