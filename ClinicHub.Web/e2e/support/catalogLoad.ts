import {spawnSync} from "node:child_process";
import path from "node:path";
import {repoRoot} from "./run.ts";

/** data/drug-catalog/tools/load_catalog.py (design M1.7 D11). */
export const CATALOG_SCRIPT = path.join(repoRoot, "data", "drug-catalog", "tools", "load_catalog.py");

export const PYTHON_HINT =
    "The e2e setup loads the shared drug catalog with Python 3 and psycopg: install Python 3.10+ (python on the PATH), " +
    "then run: python -m pip install \"psycopg[binary]\"";

/**
 * Loads the shared catalog into the run's database (design M1.7 D12), once the API's startup created, migrated and
 * seeded it: `python load_catalog.py --connection …` without a shell. Throws with {@link PYTHON_HINT} when Python or
 * psycopg is missing, else with the script's output. M1.7b T0: a first version; track `harness` owns it.
 */
export const loadCatalog = (database: string) => {
    const connection = `host=localhost port=5432 dbname=${database} user=drags password=drags`;
    const result = spawnSync("python", [CATALOG_SCRIPT, "--connection", connection], {encoding: "utf8", shell: false});
    if (result.error) throw new Error(`${PYTHON_HINT} (${result.error.message})`);
    if (result.status !== 0) {
        throw new Error(result.stderr.includes("No module named 'psycopg'")
            ? PYTHON_HINT
            : `load_catalog.py failed (${result.status}): ${result.stdout}${result.stderr}`);
    }
};
