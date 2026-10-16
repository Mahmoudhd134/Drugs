import {describe, expect, test, vi} from "vitest";
import {act, screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {anAuthResult, api, isolate, problem, recordRequests, renderWithProviders, server} from "../../../test";
import type {LanguageCode} from "../../../i18n/languages.ts";
import {LoginPage} from "./LoginPage.tsx";

// The login page: docs/features/auth/tech.md "Frontend" (LoginPage) and "API", business.md «الرسائل التي تظهر
// للمستخدم» (messages quoted from the catalog: ar.ts / en.ts).

const PHONE = "01001234567";

type Options = { lang?: LanguageCode; mode?: "Display" | "Sms"; resendAfterSeconds?: number; devCode?: string };

/** The login page of an anonymous visitor; `POST /auth/otp/request` sends a code (no devCode unless given). */
const openLogin = async ({lang = "ar", mode = "Sms", resendAfterSeconds = 60, devCode}: Options = {}) => {
    server.use(
        http.get(api("/auth/otp/mode"), () => HttpResponse.json({mode})),
        http.post(api("/auth/otp/request"), () =>
            HttpResponse.json({expiresInSeconds: 300, resendAfterSeconds, ...(devCode ? {devCode} : {})})),
    );
    const rendered = await renderWithProviders(<LoginPage/>, {lang, route: "/login", auth: {status: "anonymous"}});
    const t = lang === "ar"
        ? {send: "إرسال الكود", verify: "دخول", phone: /رقم الموبايل/, code: /الكود/, change: "تغيير الرقم"}
        : {send: "Send code", verify: "Log in", phone: /Mobile number/, code: /^Code/, change: "Change number"};
    const typePhone = async (phone = PHONE) => rendered.user.type(screen.getByRole("textbox", {name: t.phone}), phone);
    /** Phone → «إرسال الكود» → the code step. */
    const toCodeStep = async (phone = PHONE) => {
        await typePhone(phone);
        await rendered.user.click(screen.getByRole("button", {name: t.send}));
        return screen.findByRole("textbox", {name: t.code});
    };
    /** On the code step: types `code` and presses «دخول». */
    const verify = async (code = "123456") => {
        await rendered.user.type(await screen.findByRole("textbox", {name: t.code}), code);
        await rendered.user.click(screen.getByRole("button", {name: t.verify}));
    };
    return {...rendered, t, typePhone, toCodeStep, verify};
};

/** `POST /auth/otp/verify` answering `answer`. */
const verifyAnswers = (answer: () => Response) => server.use(http.post(api("/auth/otp/verify"), answer));

const expectAlert = async (text: string) => expect(await screen.findByRole("alert")).toHaveTextContent(text);

describe("login page: display mode @area:auth", () => {
    test("before any code is requested, the display-mode banner shows (ar, en) @AUTH-002", async () => {
        await openLogin({mode: "Display"});
        expect(await screen.findByText("وضع عرض الكود: يظهر الكود هنا بدل إرساله برسالة SMS (للتطوير فقط).")).toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: /رقم الموبايل/})).toBeInTheDocument();
    });

    test("the banner in English @AUTH-002", async () => {
        await openLogin({mode: "Display", lang: "en"});
        expect(await screen.findByText("OTP display mode: codes are shown here instead of being sent by SMS (development only).")).toBeInTheDocument();
    });

    test("on the code step the banner is still visible @AUTH-003", async () => {
        verifyAnswers(() => problem(400, "codeExpired"));
        const page = await openLogin({mode: "Display", devCode: "123456"});
        await page.toCodeStep();
        // The shown code was submitted by itself and refused: the page stays on the code step
        expect(await screen.findByText("انتهت صلاحية هذا الكود. اطلب كودًا جديدًا.")).toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: /الكود/})).toHaveValue("123456");
        expect(screen.getByText("وضع عرض الكود: يظهر الكود هنا بدل إرساله برسالة SMS (للتطوير فقط).")).toBeInTheDocument();
    });

    test("no banner in SMS mode", async () => {
        const page = await openLogin({mode: "Sms"});
        await page.toCodeStep();
        expect(screen.queryByText(/وضع عرض الكود/)).not.toBeInTheDocument();
    });
});

describe("login page: phone step @area:auth", () => {
    test("the phone input shows the hint «مثال: 01001234567» @AUTH-034", async () => {
        await openLogin();
        expect(await screen.findByText("مثال: 01001234567")).toBeInTheDocument();
    });

    test("an invalid phone: «أدخل رقم موبايل صحيحًا.» and the page stays on the phone step @AUTH-017", async () => {
        const page = await openLogin();
        server.use(http.post(api("/auth/otp/request"), () => problem(400, "invalidPhone")));
        await page.typePhone("12");
        await page.user.click(screen.getByRole("button", {name: "إرسال الكود"}));
        await expectAlert("أدخل رقم موبايل صحيحًا.");
        expect(screen.getByRole("textbox", {name: /رقم الموبايل/})).toHaveValue("12");
        expect(screen.queryByRole("textbox", {name: /الكود/})).not.toBeInTheDocument();
    });

    test("an invalid phone in English: \"Enter a valid mobile number.\" @AUTH-017", async () => {
        const page = await openLogin({lang: "en"});
        server.use(http.post(api("/auth/otp/request"), () => problem(400, "invalidPhone")));
        await page.typePhone("12");
        await page.user.click(screen.getByRole("button", {name: "Send code"}));
        await expectAlert("Enter a valid mobile number.");
    });

    test("too many codes requested (429): «طلبات أكواد كثيرة. انتظر قليلًا ثم حاول مرة أخرى.» (ar, en) @AUTH-030", async () => {
        const page = await openLogin();
        server.use(http.post(api("/auth/otp/request"), () => problem(429, "tooManyRequests")));
        await page.typePhone();
        await page.user.click(screen.getByRole("button", {name: "إرسال الكود"}));
        await expectAlert("طلبات أكواد كثيرة. انتظر قليلًا ثم حاول مرة أخرى.");
    });

    test("too many codes requested in English @AUTH-030", async () => {
        const page = await openLogin({lang: "en"});
        server.use(http.post(api("/auth/otp/request"), () => problem(429, "tooManyRequests")));
        await page.typePhone();
        await page.user.click(screen.getByRole("button", {name: "Send code"}));
        await expectAlert("Too many codes requested. Wait a little and try again.");
    });

    test("an empty phone (or code) disables «إرسال الكود» («دخول») and sends nothing @AUTH-018", async () => {
        const page = await openLogin();
        const requests = recordRequests();
        const send = screen.getByRole("button", {name: "إرسال الكود"});
        expect(send).toBeDisabled();
        // Spaces only count as empty
        await page.typePhone("   ");
        expect(send).toBeDisabled();
        await page.user.type(screen.getByRole("textbox", {name: /رقم الموبايل/}), "{Enter}");
        expect(requests.requests.filter(r => r.method === "POST")).toEqual([]);

        await page.user.clear(screen.getByRole("textbox", {name: /رقم الموبايل/}));
        await page.toCodeStep();
        const verify = screen.getByRole("button", {name: "دخول"});
        expect(verify).toBeDisabled();
        await page.user.type(screen.getByRole("textbox", {name: /الكود/}), "{Enter}");
        expect(requests.requests.filter(r => r.path === "/auth/otp/verify")).toEqual([]);
    });
});

describe("login page: code step @area:auth", () => {
    test("shows «كود لمرة واحدة للرقم» with the phone @AUTH-033", async () => {
        const page = await openLogin();
        await page.toCodeStep();
        expect(screen.getByText(/كود لمرة واحدة للرقم/)).toHaveTextContent(`كود لمرة واحدة للرقم ${PHONE}`);
    });

    test("«تغيير الرقم» goes back to the phone step with the typed number kept @AUTH-032", async () => {
        const page = await openLogin();
        await page.toCodeStep();
        await page.user.click(screen.getByRole("button", {name: "تغيير الرقم"}));
        expect(await screen.findByRole("textbox", {name: /رقم الموبايل/})).toHaveValue(PHONE);
        expect(screen.queryByRole("textbox", {name: /الكود/})).not.toBeInTheDocument();
    });

    test("the resend button counts down from resendAfterSeconds, then «إرسال كود جديد» requests a new code @AUTH-031", async () => {
        vi.useFakeTimers({shouldAdvanceTime: true});
        const page = await openLogin({resendAfterSeconds: 2});
        const requests = recordRequests();
        await page.toCodeStep();
        expect(screen.getByRole("button", {name: "كود جديد بعد: 2 ث"})).toBeDisabled();
        await act(() => vi.advanceTimersByTimeAsync(1000));
        expect(screen.getByRole("button", {name: "كود جديد بعد: 1 ث"})).toBeDisabled();
        await act(() => vi.advanceTimersByTimeAsync(1000));
        const resend = screen.getByRole("button", {name: "إرسال كود جديد"});
        expect(resend).toBeEnabled();

        await page.user.click(resend);
        await waitFor(() => expect(requests.requests.filter(r => r.path === "/auth/otp/request")).toHaveLength(2));
        expect(requests.requests[requests.requests.length - 1]?.body).toEqual({phone: PHONE});
    });

    test("with resendAfterSeconds 0, «إرسال كود جديد» is available at once @AUTH-031", async () => {
        const page = await openLogin({resendAfterSeconds: 0});
        await page.toCodeStep();
        expect(screen.getByRole("button", {name: "إرسال كود جديد"})).toBeEnabled();
    });

    test("the right code typed in Arabic-Indic digits is sent as typed and logs in @AUTH-056", async () => {
        const auth = anAuthResult();
        verifyAnswers(() => HttpResponse.json(auth));
        const page = await openLogin();
        const requests = recordRequests();
        await page.toCodeStep();
        await page.verify("١٢٣٤٥٦");
        await waitFor(() => expect(page.auth.signIn).toHaveBeenCalledWith(auth));
        expect(requests.requests.find(r => r.path === "/auth/otp/verify")?.body).toEqual({phone: PHONE, code: "١٢٣٤٥٦"});
        expect(page.location().pathname).toBe("/");
    });
});

describe("login page: refusals of the code @area:auth", () => {
    /** The message the page shows when verify answers `answer` (in `lang`). */
    const refusal = async (answer: () => Response, lang: LanguageCode = "ar") => {
        verifyAnswers(answer);
        const page = await openLogin({lang});
        await page.toCodeStep();
        await page.verify();
        const alert = await screen.findByRole("alert");
        expect(page.auth.signIn).not.toHaveBeenCalled();
        expect(page.location().pathname).toBe("/login");
        return alert;
    };

    test("403 noAccess: «هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.» @AUTH-074 @smoke", async () => {
        expect(await refusal(() => problem(403, "noAccess"))).toHaveTextContent("هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.");
    });

    test("403 noAccess in English @AUTH-074", async () => {
        expect(await refusal(() => problem(403, "noAccess"), "en")).toHaveTextContent("This number has no access. Ask your clinic to add you.");
    });

    test("staffInactive naming one clinic: «تم إيقاف حسابك في «A». تواصل مع مالك العيادة.» @AUTH-075", async () => {
        const alert = await refusal(() => problem(403, "staffInactive", {clinicNames: ["A"]}));
        expect(alert.textContent).toBe(`تم إيقاف حسابك في «${isolate("A")}». تواصل مع مالك العيادة.`);
    });

    test("staffInactive naming one clinic in English @AUTH-075", async () => {
        const alert = await refusal(() => problem(403, "staffInactive", {clinicNames: ["A"]}), "en");
        expect(alert.textContent).toBe(`Your account in “${isolate("A")}” is deactivated. Ask the clinic owner.`);
    });

    test("staffInactive naming two clinics (ar, en) @AUTH-076", async () => {
        const ar = await refusal(() => problem(403, "staffInactive", {clinicNames: ["A", "B"]}));
        expect(ar.textContent).toBe(`تم إيقاف حسابك في العيادتين «${isolate("A")}» و«${isolate("B")}». تواصل مع مالك كل عيادة.`);
    });

    test("staffInactive naming two clinics in English @AUTH-076", async () => {
        const en = await refusal(() => problem(403, "staffInactive", {clinicNames: ["A", "B"]}), "en");
        expect(en.textContent).toBe(`Your accounts in “${isolate("A")}” and “${isolate("B")}” are deactivated. Ask the clinic owners.`);
    });

    test("staffInactive naming three clinics @AUTH-077", async () => {
        const ar = await refusal(() => problem(403, "staffInactive", {clinicNames: ["A", "B", "C"]}));
        expect(ar.textContent).toBe(`تم إيقاف حسابك في العيادات «${isolate("A")}» و«${isolate("B")}» و«${isolate("C")}». تواصل مع مالك كل عيادة.`);
    });

    test("staffInactive naming three clinics in English @AUTH-077", async () => {
        const en = await refusal(() => problem(403, "staffInactive", {clinicNames: ["A", "B", "C"]}), "en");
        expect(en.textContent).toBe(`Your accounts in “${isolate("A")}”, “${isolate("B")}”, and “${isolate("C")}” are deactivated. Ask the clinic owners.`);
    });

    test("clinicSuspended naming one clinic: «العيادة «A» موقوفة.» @AUTH-078", async () => {
        const ar = await refusal(() => problem(403, "clinicSuspended", {clinicNames: ["A"]}));
        expect(ar.textContent).toBe(`العيادة «${isolate("A")}» موقوفة.`);
    });

    test("clinicSuspended naming one clinic in English @AUTH-078", async () => {
        const en = await refusal(() => problem(403, "clinicSuspended", {clinicNames: ["A"]}), "en");
        expect(en.textContent).toBe(`“${isolate("A")}” is disabled.`);
    });

    test("clinicSuspended naming two clinics (ar, en) @AUTH-079", async () => {
        const ar = await refusal(() => problem(403, "clinicSuspended", {clinicNames: ["A", "B"]}));
        expect(ar.textContent).toBe(`العيادتان «${isolate("A")}» و«${isolate("B")}» موقوفتان.`);
    });

    test("clinicSuspended naming two clinics in English @AUTH-079", async () => {
        const en = await refusal(() => problem(403, "clinicSuspended", {clinicNames: ["A", "B"]}), "en");
        expect(en.textContent).toBe(`“${isolate("A")}” and “${isolate("B")}” are disabled.`);
    });

    test("clinicSuspended naming three clinics @AUTH-080", async () => {
        const ar = await refusal(() => problem(403, "clinicSuspended", {clinicNames: ["A", "B", "C"]}));
        expect(ar.textContent).toBe(`العيادات «${isolate("A")}» و«${isolate("B")}» و«${isolate("C")}» موقوفة.`);
    });

    test("clinicSuspended naming three clinics in English @AUTH-080", async () => {
        const en = await refusal(() => problem(403, "clinicSuspended", {clinicNames: ["A", "B", "C"]}), "en");
        expect(en.textContent).toBe(`“${isolate("A")}”, “${isolate("B")}”, and “${isolate("C")}” are disabled.`);
    });

    test("a wrong code: «الكود غير صحيح. راجعه وحاول مرة أخرى.» @AUTH-081", async () => {
        expect(await refusal(() => problem(400, "invalidCode"))).toHaveTextContent("الكود غير صحيح. راجعه وحاول مرة أخرى.");
    });

    test("a wrong code in English @AUTH-081", async () => {
        expect(await refusal(() => problem(400, "invalidCode"), "en")).toHaveTextContent("Wrong code. Check it and try again.");
    });

    test("an expired code: «انتهت صلاحية هذا الكود. اطلب كودًا جديدًا.» @AUTH-082", async () => {
        expect(await refusal(() => problem(400, "codeExpired"))).toHaveTextContent("انتهت صلاحية هذا الكود. اطلب كودًا جديدًا.");
    });

    test("an expired code in English @AUTH-082", async () => {
        expect(await refusal(() => problem(400, "codeExpired"), "en")).toHaveTextContent("This code has expired. Ask for a new one.");
    });

    test("too many wrong tries: «محاولات خاطئة كثيرة. اطلب كودًا جديدًا.» @AUTH-083", async () => {
        expect(await refusal(() => problem(400, "tooManyAttempts"))).toHaveTextContent("محاولات خاطئة كثيرة. اطلب كودًا جديدًا.");
    });

    test("too many wrong tries in English @AUTH-083", async () => {
        expect(await refusal(() => problem(400, "tooManyAttempts"), "en")).toHaveTextContent("Too many wrong tries. Ask for a new code.");
    });
});
