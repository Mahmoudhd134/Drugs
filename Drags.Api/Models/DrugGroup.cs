namespace Drags.Api.Models;

public class DrugGroup
{
    public int Id { get; set; }
    public string Name { get; set; }
    public List<DrugGroupItem> Items { get; set; } = [];
}

public class DrugGroupItem
{
    public int Id { get; set; }
    public int DrugGroupId { get; set; }
    public int DrugId { get; set; }
    public int Order { get; set; }

    public DrugGroup DrugGroup { get; set; }
    public Drug Drug { get; set; }
}
