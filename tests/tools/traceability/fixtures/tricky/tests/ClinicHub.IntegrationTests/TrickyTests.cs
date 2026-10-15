public class TrickyTests
{
    [Fact]
    // [Trait("Case", "FIX-001")]
    public void Commented_out() { }

    /*
    [Fact]
    [Trait("Case", "FIX-001")]
    public void In_a_block_comment() { }
    */

    [Theory(Skip = "BUG-002: the server accepts it")]
    [InlineData(1,
        2)]
    [Trait("Case", "FIX-003")]
    public void Multi_line_attribute_known_bug(int a, int b) { }
}
