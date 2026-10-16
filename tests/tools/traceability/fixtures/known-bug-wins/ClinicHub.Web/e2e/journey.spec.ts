test("the journey @FIX-003", async ({isMobile}) => {
    test.skip(isMobile, "the desktop layout");
    test.fixme(isMobile, "BUG-121: the phone layout breaks");
});
test.fixme(
    "BUG-122: a known bug with no case tag",
    async () => {});
