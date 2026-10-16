public class ApiTests
{
    [Fact]
    [Trait("Case", "FIX-001")]
    public void Passes_for_one_part() { }

    [Fact(Skip = "BUG-011: the other part is wrong")]
    [Trait("Case", "FIX-001")]
    public void Known_bug_for_another_part() { }

    [Fact]
    [Trait("Case", "FIX-003")]
    public void Server_rule() { }

    [Fact(Skip = "BUG-012: a known bug with no case tag")]
    public void Untagged_known_bug() { }
}
