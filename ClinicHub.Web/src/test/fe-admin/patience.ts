import {configure} from "@testing-library/react";
import {vi} from "vitest";

// The pages here load through MSW, React Query and MUI transitions: on a busy machine (the whole suite in parallel,
// other test runs at the same time) a findBy… can take more than Testing Library's default 1 s, and a test more than
// the suite's 20 s. Imported by the fe-admin tests only (each test file has its own copy of both settings).
configure({asyncUtilTimeout: 10_000});
vi.setConfig({testTimeout: 60_000});
