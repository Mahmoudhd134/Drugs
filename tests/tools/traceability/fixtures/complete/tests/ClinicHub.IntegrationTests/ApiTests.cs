public class ApiTests
{
    [Fact]
    [Trait("Tier", "Smoke")]
    [Trait("Case", "FIX-001")]
    public void Happy() { }

    [Fact(Skip = "BUG-001: the server accepts it")]
    [Trait("Case", "FIX-003")]
    public void Refused() { }
}
