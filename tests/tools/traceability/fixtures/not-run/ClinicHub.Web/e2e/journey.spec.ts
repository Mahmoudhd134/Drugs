test.fail("BUG-132: the message is wrong @FIX-003", async ({lang}) => {
    // A condition inside a running known-bug test, naming its bug: fine
    test.skip(lang !== "en", "the English UI only (BUG-132)");
});
// A declared skip of the same bug: never runs, listed although BUG-132 runs above
test.fixme("BUG-132: the phone layout @FIX-003", async () => {});
test("the journey @FIX-003", async ({isMobile}) => {
    // An expected failure without a BUG id: fails the run
    test.fail(isMobile, "flaky on the phone");
});
