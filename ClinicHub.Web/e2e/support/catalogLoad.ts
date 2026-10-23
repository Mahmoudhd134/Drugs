import {spawnSync} from "node:child_process";
import path from "node:path";
import {repoRoot} from "./run.ts";

/** data/drug-catalog/tools/load_catalog.py (design M1.7 D11). */
export const CATALOG_SCRIPT = path.join(repoRoot, "data", "drug-catalog", "tools", "load_catalog.py");

export const PYTHON_HINT =
    "The e2e setup loads the shared drug catalog with Python 3 and psycopg: install Python 3.10+ (python on the PATH), " +
    "then run: python -m pip install \"psycopg[binary]\"";

/** A load takes a few seconds; a hung Python is killed and fails the setup. */
const LOAD_TIMEOUT_MS = 5 * 60_000;

/**
 * Loads the shared catalog into the run's database (design M1.7 D12), once the API's startup created, migrated and
 * seeded it: `python load_catalog.py --connection …` without a shell. Throws with {@link PYTHON_HINT} when Python or
 * psycopg is missing (also the Windows "python" app alias that only opens the Store: exit code 9009), else with the
 * script's output.
 */
export const loadCatalog = (database: string) => {
    const connection = `host=localhost port=5432 dbname=${database} user=drags password=drags`;
    const started = Date.now();
    const result = spawnSync("python", [CATALOG_SCRIPT, "--connection", connection], {
        encoding: "utf8",
        shell: false,
        timeout: LOAD_TIMEOUT_MS,
        env: {...process.env, PYTHONIOENCODING: "utf-8"},
    });
    if (result.error && (result.error as NodeJS.ErrnoException).code === "ETIMEDOUT") {
        throw new Error(`load_catalog.py did not finish within ${LOAD_TIMEOUT_MS / 60_000} minutes (killed)`);
    }
    if (result.error) throw new Error(`${PYTHON_HINT} (${result.error.message})`);
    if (result.status !== 0) {
        throw new Error(result.stderr.includes("No module named 'psycopg'") || result.status === 9009
            ? PYTHON_HINT
            : `load_catalog.py failed (${result.status ?? result.signal}): ${result.stdout}${result.stderr}`);
    }
    console.log(`e2e: ${result.stdout.trim()} (${Date.now() - started} ms)`);
};
