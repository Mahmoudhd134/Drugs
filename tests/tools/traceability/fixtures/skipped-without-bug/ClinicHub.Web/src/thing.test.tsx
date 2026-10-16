test.skip("not done yet @FIX-005", () => {});
test.todo("@FIX-005 later");
describe.skip(
    "unfinished, wrapped",
    () => {
        test("inside @FIX-002", () => {});
    },
);
test.fails("expected to fail, no bug id @FIX-005", () => {});
