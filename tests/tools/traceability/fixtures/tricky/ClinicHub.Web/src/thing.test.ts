// regression for @FIX-005
/* test("old @FIX-005", () => {}); */
test("opens https://example.test/page", () => {}); // @FIX-005
test("logs in as owner@clinic-1.test", () => {});
describe.skip("legacy", legacySuite);
test("runs after a describe.skip with no body @FIX-002", () => {});
