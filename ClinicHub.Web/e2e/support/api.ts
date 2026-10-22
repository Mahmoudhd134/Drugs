import {type APIRequestContext, type APIResponse, request} from "@playwright/test";

/** `AuthResult` / `Context` of the API (docs/features/auth/tech.md "Shapes"). */
export type ClinicContext = { type: "clinic"; clinicId: number; clinicName: string; isTemplate: boolean; roles: string[] };
export type Context = ClinicContext | { type: "platform" };
export type AuthResult = { accessToken: string; expiresAt: string; context: Context | null; contexts: Context[] };

/** Where an API session should end up after its login. */
export type Target = "platform" | "template" | { clinicId: number } | "asIs";

/**
 * An API session outside the browser (its own cookie jar, like a browser), used to build test data through the
 * real endpoints, as the docs prescribe: the super admin → clinics, staff and roles; an owner → drugs and protocols.
 * A 401 (the 15-min access token expired in a long worker) refreshes once and replays the request.
 */
export class ApiSession {
    private token: string | null = null;
    auth: AuthResult | null = null;

    readonly http: APIRequestContext;
    readonly phone: string;

    private constructor(http: APIRequestContext, phone: string) {
        this.http = http;
        this.phone = phone;
    }

    static async login(baseURL: string, phone: string, target: Target = "asIs"): Promise<ApiSession> {
        // Setup calls: a long timeout, the API may be slow on a busy machine (several test runs at once)
        const http = await request.newContext({baseURL, timeout: 60_000});
        const session = new ApiSession(http, phone);
        await session.signIn(target);
        return session;
    }

    private async signIn(target: Target) {
        const otp = await this.http.post("/api/v1/auth/otp/request", {data: {phone: this.phone}});
        await expectOk(otp, `OTP request for ${this.phone}`);
        const {devCode} = await otp.json() as { devCode?: string };
        if (!devCode) throw new Error("The e2e API must run in OTP Display mode (devCode missing)");
        const verify = await this.http.post("/api/v1/auth/otp/verify", {data: {phone: this.phone, code: devCode}});
        await expectOk(verify, `login of ${this.phone}`);
        this.take(await verify.json() as AuthResult);
        await this.enter(target);
    }

    /** Switches the session's context (no-op when already there). */
    async enter(target: Target) {
        if (target === "asIs") return;
        const context = this.findContext(target);
        if (sameContext(context, this.auth?.context ?? null)) return;
        const body = context.type === "platform" ? {type: "platform"} : {type: "clinic", clinicId: context.clinicId};
        const response = await this.http.post("/api/v1/auth/context", {data: body, headers: this.headers()});
        await expectOk(response, `switch of ${this.phone} to ${JSON.stringify(body)}`);
        this.take(await response.json() as AuthResult);
    }

    private findContext(target: Exclude<Target, "asIs">): Context {
        const contexts = this.auth?.contexts ?? [];
        const found = target === "platform" ? contexts.find(c => c.type === "platform")
            : target === "template" ? contexts.find(c => c.type === "clinic" && c.isTemplate)
                : contexts.find(c => c.type === "clinic" && c.clinicId === target.clinicId);
        if (!found) throw new Error(`${this.phone} has no context ${JSON.stringify(target)}: ${JSON.stringify(contexts)}`);
        return found;
    }

    private take(auth: AuthResult) {
        this.auth = auth;
        this.token = auth.accessToken;
    }

    private headers(): Record<string, string> {
        return this.token ? {Authorization: `Bearer ${this.token}`} : {};
    }

    private async refresh() {
        const response = await this.http.post("/api/v1/auth/refresh");
        await expectOk(response, `refresh of ${this.phone}`);
        this.take(await response.json() as AuthResult);
    }

    async send(method: "GET" | "POST" | "PUT" | "DELETE", url: string, data?: unknown): Promise<APIResponse> {
        const go = () => this.http.fetch(url, {method, data, headers: this.headers()});
        let response = await go();
        if (response.status() === 401) {
            await this.refresh();
            response = await go();
        }
        return response;
    }

    /** Sends and returns the JSON answer, failing on any non-2xx (the setup must work). */
    async ok<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", url: string, data?: unknown): Promise<T> {
        const response = await this.send(method, url, data);
        await expectOk(response, `${method} ${url}`);
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
    }

    async dispose() {
        await this.http.dispose();
    }
}

const sameContext = (a: Context, b: Context | null) =>
    !!b && a.type === b.type && (a.type === "platform" || (b.type === "clinic" && a.clinicId === b.clinicId));

export const expectOk = async (response: APIResponse, what: string) => {
    if (response.ok()) return;
    throw new Error(`Test setup failed: ${what} answered ${response.status()} ${await response.text()}`);
};
