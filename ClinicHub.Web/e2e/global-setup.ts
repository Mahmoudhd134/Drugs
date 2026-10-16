import {type ChildProcess, spawn, spawnSync} from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {ApiSession} from "./support/api.ts";
import {apiProject, DB_PREFIX, ensureDir, newRunId, publishState, repoRoot, type RunState, type TemplateCatalog, webRoot} from "./support/run.ts";
import {SUPER_ADMIN_POOL, superAdminPhones} from "./support/phones.ts";

/**
 * The e2e environment of one run (design M1.6 § 6, D3): a database `drags_e2e_<run>` on the compose PostgreSQL
 * (created and migrated by the API's own startup), the SPA built into ClinicHub.Api/wwwroot, the Release API
 * (environment Testing) on a free port from 5080 serving it, and the template's catalog. The returned function is the
 * teardown: it stops the API and drops the database.
 *
 * Settings on top of appsettings.Testing.json (environment variables):
 * - `Platform:SuperAdminPhones`: a pool of super admin phones, one claimed per test, so the OTP limits of one phone
 *   (5 codes per hour) never meet the many super admin logins of a run;
 * - `Otp:ResendSeconds` = 0: a test may log the same person in twice in a row (another tab, after a logout); the
 *   60 s rule itself is proven by the api tests (AUTH-020…). The hourly limit (5) and the 5 tries stay as intended.
 *
 * `CLINICHUB_E2E_NO_BUILD=1` reuses the last SPA and API builds (faster local iterations).
 */
const POSTGRES = "drags-postgres";

const run = (command: string, args: string[], cwd: string) => {
    const result = spawnSync(command, args, {cwd, stdio: "inherit", shell: process.platform === "win32"});
    if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.error?.message})`);
};

const psql = (sql: string) => {
    const result = spawnSync("docker", ["exec", POSTGRES, "psql", "-U", "drags", "-d", "postgres", "-Atc", sql], {encoding: "utf8"});
    if (result.status !== 0) throw new Error(`psql failed: ${result.stderr || result.error?.message}`);
    return result.stdout.split(/\r?\n/).filter(Boolean);
};

const ensurePostgres = async () => {
    const ready = () => spawnSync("docker", ["exec", POSTGRES, "pg_isready", "-U", "drags", "-d", "postgres"]).status === 0;
    if (ready()) return;
    run("docker", ["compose", "up", "-d"], repoRoot);
    const until = Date.now() + 90_000;
    while (!ready()) {
        if (Date.now() > until) throw new Error("PostgreSQL (docker compose) did not become ready");
        await new Promise(r => setTimeout(r, 1000));
    }
};

const assertE2eDatabase = (name: string) => {
    if (!new RegExp(`^${DB_PREFIX}[a-z0-9]+$`).test(name)) throw new Error(`Refusing database "${name}": e2e only uses ${DB_PREFIX}<run>`);
};

const dropDatabase = (name: string) => {
    assertE2eDatabase(name);
    psql(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
};

/** Databases of crashed runs: older than a day (a live parallel run's database is never that old). */
const dropStaleDatabases = () => {
    const stale = psql(`SELECT datname FROM pg_database WHERE datname LIKE '${DB_PREFIX.replace(/_/g, "\\_")}%' `
        + `AND (pg_stat_file('base/' || oid || '/PG_VERSION')).modification < now() - interval '1 day'`);
    for (const name of stale) {
        try { dropDatabase(name); } catch (e) { console.warn(`e2e: could not drop stale ${name}: ${(e as Error).message}`); }
    }
};

const isFree = (port: number, host: string) => new Promise<boolean>(resolve => {
    const server = net.createServer();
    server.once("error", (e: NodeJS.ErrnoException) => resolve(e.code === "EADDRNOTAVAIL"));
    server.listen(port, host, () => server.close(() => resolve(true)));
});

const freePort = async () => {
    for (let port = 5080; port < 5200; port++) {
        if (await isFree(port, "127.0.0.1") && await isFree(port, "::1")) return port;
    }
    throw new Error("No free port in 5080–5199 for the e2e API");
};

const killTree = (child: ChildProcess) => {
    if (child.exitCode !== null || !child.pid) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {stdio: "ignore"});
    else child.kill("SIGKILL");
};

const waitForApi = async (baseURL: string, child: ChildProcess, log: string) => {
    const until = Date.now() + 180_000;
    while (Date.now() < until) {
        if (child.exitCode !== null) {
            throw new Error(`The e2e API exited (${child.exitCode}) before answering; its log:\n${tail(log)}`);
        }
        try {
            const response = await fetch(`${baseURL}/api/v1/auth/otp/mode`);
            if (response.ok) return;
        } catch { /* not listening yet */ }
        await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`The e2e API did not answer within 3 minutes; its log:\n${tail(log)}`);
};

const tail = (file: string) => {
    try { return fs.readFileSync(file, "utf8").split(/\r?\n/).slice(-40).join("\n"); } catch { return "(no log)"; }
};

/**
 * The template's catalog, as the Development seed has it (docs/tech/overview.md "Runtime architecture"): two eye
 * drops and the group "After cataract surgery" using both, the second line overriding the drug's dosing with a taper
 * (and "ask" eye). New clinics get a copy (ADM-088).
 */
const seedTemplate = async (baseURL: string, phone: string): Promise<TemplateCatalog> => {
    const admin = await ApiSession.login(baseURL, phone, "template");
    try {
        const drug = (name: string, description: string, weeks: number) => admin.ok<{ id: number }>("POST", "/api/v1/drugs", {
            name, description,
            defaultDosing: {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationValue: weeks, durationUnit: "weeks"},
        });
        const antibiotic = await drug("Moxifloxacin 0.5%", "Antibiotic eye drops", 1);
        const steroid = await drug("Prednisolone acetate 1%", "Steroid eye drops", 4);
        const group = "After cataract surgery";
        await admin.ok("POST", "/api/v1/drug-groups", {
            name: group,
            items: [
                {drugId: antibiotic.id, dosing: null},
                {
                    drugId: steroid.id,
                    dosing: {
                        eye: "ask",
                        taperSteps: [4, 3, 2, 1].map(times => ({frequency: "daily", frequencyValue: times, durationValue: 1, durationUnit: "weeks"})),
                    },
                },
            ],
        });
        return {drugs: ["Moxifloxacin 0.5%", "Prednisolone acetate 1%"], group: {name: group, lines: 2}};
    } finally {
        await admin.dispose();
    }
};

/** Folders of earlier runs (their api.log) older than a day. */
const pruneOldRuns = (root: string) => {
    for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
        const dir = path.join(root, entry.name);
        if (!entry.isDirectory() || !fs.existsSync(path.join(dir, "api.log"))) continue;
        if (Date.now() - fs.statSync(dir).mtimeMs > 24 * 3600 * 1000) fs.rmSync(dir, {recursive: true, force: true});
    }
};

export default async function globalSetup() {
    const runId = newRunId();
    const database = `${DB_PREFIX}${runId}`;
    assertE2eDatabase(database);
    pruneOldRuns(ensureDir(path.join(repoRoot, "artifacts", "e2e")));
    const runDir = ensureDir(path.join(repoRoot, "artifacts", "e2e", runId));
    ensureDir(path.join(runDir, "claims"));

    await ensurePostgres();
    dropStaleDatabases();

    if (process.env.CLINICHUB_E2E_NO_BUILD !== "1") {
        run("npm", ["run", "build"], webRoot);
        run("dotnet", ["build", path.join(apiProject, "ClinicHub.Api.csproj"), "-c", "Release", "-nologo", "-v", "q"], repoRoot);
    }

    const port = await freePort();
    const baseURL = `http://localhost:${port}`;
    const phones = superAdminPhones();
    const log = path.join(runDir, "api.log");
    const logStream = fs.openSync(log, "w");
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        ASPNETCORE_ENVIRONMENT: "Testing",
        ASPNETCORE_URLS: baseURL,
        ConnectionStrings__DefaultConnection: `Host=localhost;Port=5432;Database=${database};Username=drags;Password=drags`,
        Otp__ResendSeconds: "0",
        Logging__LogLevel__Default: "Warning",
    };
    phones.forEach((phone, i) => { env[`Platform__SuperAdminPhones__${i}`] = phone; });

    // The run works on its own copies of the builds: a later build (test.ps1, another run) never meets a locked file
    // nor changes the SPA under a running test
    const bin = path.join(apiProject, "bin", "Release", "net9.0");
    if (!fs.existsSync(path.join(bin, "ClinicHub.Api.dll"))) throw new Error(`${bin} has no API build: dotnet build -c Release, or drop CLINICHUB_E2E_NO_BUILD`);
    if (!fs.existsSync(path.join(apiProject, "wwwroot", "index.html"))) throw new Error("ClinicHub.Api/wwwroot has no SPA: npm run build, or drop CLINICHUB_E2E_NO_BUILD");
    const apiCopy = path.join(runDir, "api");
    const webCopy = path.join(runDir, "wwwroot");
    fs.cpSync(bin, apiCopy, {recursive: true});
    fs.cpSync(path.join(apiProject, "wwwroot"), webCopy, {recursive: true});
    // Content root = the project folder (appsettings.Testing.json); web root = the copied SPA
    const child = spawn("dotnet", [path.join(apiCopy, "ClinicHub.Api.dll"), "--contentRoot", apiProject, "--webroot", webCopy],
        {cwd: apiProject, env, stdio: ["ignore", logStream, logStream]});

    let stopped = false;
    const teardown = async () => {
        if (stopped) return;
        stopped = true;
        killTree(child);
        try { dropDatabase(database); } catch (e) { console.warn(`e2e: could not drop ${database}: ${(e as Error).message}`); }
        // The copies go; the run's folder keeps api.log
        for (const copy of [apiCopy, webCopy]) {
            try { fs.rmSync(copy, {recursive: true, force: true, maxRetries: 5, retryDelay: 500}); } catch { /* best effort */ }
        }
    };
    // The runner killed (Ctrl+C): don't leave the API running
    process.once("exit", () => { if (!stopped) { killTree(child); } });

    try {
        await waitForApi(baseURL, child, log);
        const template = await seedTemplate(baseURL, phones[0]);
        const state: RunState = {runId, database, baseURL, runDir, superAdminPhones: phones, template};
        publishState(state);
        console.log(`e2e: API ${baseURL} (Testing), database ${database}, ${SUPER_ADMIN_POOL} super admin phones`);
    } catch (e) {
        await teardown();
        throw e;
    }
    return teardown;
}
