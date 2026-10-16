test("the flow @LVL-003", async ({isMobile}) => {
    test.fail(isMobile, "BUG-592: the phone layout breaks");
});
test.fail(
    "BUG-591: the card names are cut @LVL-004",
    async () => {});
test.fail("BUG-593: the English banner's contrast @LVL-004", async ({lang}) => {
    test.skip(lang !== "en", "the English UI only (BUG-593)");
});
