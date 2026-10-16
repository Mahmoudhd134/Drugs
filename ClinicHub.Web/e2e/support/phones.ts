import fs from "node:fs";
import path from "node:path";
import {test} from "@playwright/test";
import {runState} from "./run.ts";

/**
 * Phones of a run. The database is new for every run, so phones only need to be unique inside it.
 * - Super admins: a pool of `+20100<run prefix>xxxx` given to the API at startup (`Platform:SuperAdminPhones`); the first is
 *   global setup's, every other one is claimed by at most one login of the run (an exclusive file per phone), so the
 *   OTP limits of a phone (5 codes per hour) are never reached by the many super admin logins.
 * - Everyone else: `+2012` + the worker's index + a counter (local form `012…`).
 */
export const SUPER_ADMIN_POOL = 400;

export const superAdminPhones = (runId: string) => {
    // Its own prefix per run (100–998: never the dev phones +2010000…, nor the Testing super admin +201009990001), so a
    // run that reached another run's API by mistake is refused (403) instead of logging in there
    let hash = 0;
    for (const char of runId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const prefix = 100 + (hash % 899);
    return Array.from({length: SUPER_ADMIN_POOL}, (_, i) => `+20100${prefix}${String(i).padStart(4, "0")}`);
};

let nextClaim = 1;

/** A super admin phone no one else uses in this run. */
export const claimSuperAdminPhone = () => {
    const {superAdminPhones: pool, runDir} = runState();
    for (; nextClaim < pool.length; nextClaim++) {
        try {
            fs.closeSync(fs.openSync(path.join(runDir, "claims", String(nextClaim)), "wx"));
            return pool[nextClaim++];
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        }
    }
    throw new Error(`All ${pool.length} super admin phones of the run are used: raise SUPER_ADMIN_POOL`);
};

let counter = 0;

const workerIndex = () => {
    try {
        return test.info().workerIndex;
    } catch {
        return process.pid;
    }
};

/** A new phone in E.164 (`+2012…`), unique in the run. */
export const uniquePhone = () => {
    counter++;
    return `+2012${String(workerIndex() % 1000).padStart(3, "0")}${String(counter % 100000).padStart(5, "0")}`;
};

/** The local form of an Egyptian E.164 phone (`+2012…` → `012…`), as people type it. */
export const localPhone = (e164: string) => `0${e164.slice(3)}`;

/** A short token unique in the run, for names. */
export const unique = () => `${workerIndex()}x${++counter}${Math.floor(Math.random() * 1296).toString(36)}`;

/** Like `unique()` with digits only (for names that must hold no Latin letter, e.g. an all-Arabic UI check). */
export const uniqueDigits = () => `${workerIndex()}0${++counter}${Math.floor(Math.random() * 1000)}`;
