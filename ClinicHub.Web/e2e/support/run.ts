import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

/**
 * Where an e2e run keeps its things, and what global setup tells the tests (through environment variables, which
 * Playwright's workers inherit from the runner process).
 */
const here = path.dirname(fileURLToPath(import.meta.url));

/** ClinicHub.Web */
export const webRoot = path.resolve(here, "..", "..");
/** The repository (worktree) root */
export const repoRoot = path.resolve(webRoot, "..");
export const apiProject = path.join(repoRoot, "ClinicHub.Api");

/** The e2e database prefix: global setup refuses any other name (never the dev database `drags`). */
export const DB_PREFIX = "drags_e2e_";

/**
 * The run id: `CLINICHUB_TEST_RUN` (set by test.ps1, unique per runner call) or a new one. Only [a-z0-9], so the
 * database name needs no quoting surprises.
 */
export const newRunId = () => {
    const given = (process.env.CLINICHUB_TEST_RUN ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const stamp = Date.now().toString(36) + Math.floor(Math.random() * 36 ** 3).toString(36);
    return (given ? `${given}${stamp}` : `e2e${stamp}`).slice(0, 40);
};

/** Values global setup hands to the workers. */
export type RunState = {
    runId: string;
    database: string;
    baseURL: string;
    /** Folder of this run (claims of super admin phones, logs) */
    runDir: string;
    /** The super admin phones the API was started with (pool; each test claims its own) */
    superAdminPhones: string[];
    /** The template's catalog seeded by global setup (copied into every new clinic) */
    template: TemplateCatalog;
};

export type TemplateCatalog = {
    drugs: string[];
    protocol: { name: string; lines: number };
};

const STATE_ENV = "CLINICHUB_E2E_STATE";

export const publishState = (state: RunState) => {
    process.env[STATE_ENV] = JSON.stringify(state);
};

let cached: RunState | null = null;

/** The run's state, inside a worker (or the runner after global setup). */
export const runState = (): RunState => {
    if (cached) return cached;
    const raw = process.env[STATE_ENV];
    if (!raw) throw new Error("No e2e run state: the tests must run through playwright.config.ts (its global setup starts the API)");
    cached = JSON.parse(raw) as RunState;
    return cached;
};

export const ensureDir = (dir: string) => {
    fs.mkdirSync(dir, {recursive: true});
    return dir;
};
