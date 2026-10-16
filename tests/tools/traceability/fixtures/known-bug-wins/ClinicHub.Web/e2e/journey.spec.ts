test("the journey @FIX-003", async ({isMobile}) => {
    test.skip(isMobile, "the desktop layout");
    test.fail(isMobile, "BUG-121: the phone layout breaks");
});
test.fail(
    "BUG-122: a known bug with no case tag",
    async () => {});
