import {setupServer} from "msw/node";

/**
 * The one MSW server of the test run (started in setup.ts). A test adds its handlers with
 * `server.use(...handlers)`; they are reset after each test. A request no handler answers is a network error for the app
 * and fails the test (setup.ts).
 */
export const server = setupServer();
