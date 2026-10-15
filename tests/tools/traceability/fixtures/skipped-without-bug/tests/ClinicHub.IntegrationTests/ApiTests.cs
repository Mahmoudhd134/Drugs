public class ApiTests
{
    private const string Later = "BUG-001: looks like a bug id, but a const";

    [Fact(Skip = "flaky, later")]
    [Trait("Case", "FIX-001")]
    public void Happy() { }

    [Fact(Skip = Later)]
    [Trait("Case", "FIX-001")]
    public void Const_skip() { }

    [Fact(Skip = $"BUG-001: interpolated {nameof(ApiTests)}")]
    [Trait("Case", "FIX-001")]
    public void Interpolated_skip() { }

    [Fact(Skip = @"BUG-001: verbatim")]
    [Trait("Case", "FIX-001")]
    public void Verbatim_skip() { }
}
