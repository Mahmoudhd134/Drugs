namespace Drags.Api.Models;

public class Drag
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Description { get; set; }
    public List<ComboDrag> ComboDrags { get; set; }
}

public class Combo
{
    public int Id { get; set; }
    public string Name { get; set; }
    public List<ComboDrag> ComboDrags { get; set; }
}

public class ComboDrag
{
    public int Id { get; set; }
    public int DragId { get; set; }
    public int ComboId { get; set; }
    public int Order { get; set; }

    public Combo Combo { get; set; }
    public Drag Drag { get; set; }
}