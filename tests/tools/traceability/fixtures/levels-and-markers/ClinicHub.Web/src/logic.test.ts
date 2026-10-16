// A .test.ts file: the unit level only (LVL-002 is a ui case: not counted from here)
test("computes it @LVL-001 @LVL-002 @LVL-005", () => {});
test.fails.each(rows(name => name.length > 0))(
    "BUG-602: a whitespace-only code is kept: %s @LVL-005",
    (_name) => check(_name));
