import {setupServer} from "msw/node";

/**
 * The one MSW server of the test run (started in setup.ts). A test adds its handlers with
 * `server.use(...handlers)`; they are reset after each test. A request no handler answers fails the test
 * (`onUnhandledRequest: "error"`).
 */
export const server = setupServer();
