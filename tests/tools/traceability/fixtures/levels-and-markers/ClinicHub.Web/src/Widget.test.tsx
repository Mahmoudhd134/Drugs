// A .test.tsx file: the ui level; the unit level only of a case without a ui level (LVL-003, not LVL-006)
test("shows it @LVL-001 @LVL-003 @LVL-006", () => {});
test.fails("BUG-601: the chip reads the wrong total @LVL-004", () => {});
