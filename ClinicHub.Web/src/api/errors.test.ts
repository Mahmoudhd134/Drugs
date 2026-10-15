import {describe, expect, test} from "vitest";
import {http, HttpResponse} from "msw";
import i18n from "../i18n";
import {api as apiUrl, networkError, problem, server} from "../test";
import {api} from "./client.ts";
import {getErrorMessage, getFieldErrors, getOtherErrors, splitFormErrors, toApiError} from "./errors.ts";

// Reading errors in the SPA: docs/tech/overview.md "Data fetching", "Errors (ProblemDetails)"; auth/tech.md "Frontend".

/** The error of a real request answered by `response` (through the app's axios client and MSW). */
const failWith = async (response: () => Response) => {
    server.use(http.get(apiUrl("/test"), response));
    try {
        await api.get("/test");
    } catch (error) {
        return error;
    }
    throw new Error("The request did not fail");
};

const isolate = (name: string) => `\u2068${name}\u2069`;

describe("toApiError @area:errors", () => {
    test("a ProblemDetails answer gives status, code, errors and traceId; no HTTP answer gives null @ERR-023", async () => {
        const error = await failWith(() => problem(400, "nameRequired", {
            errors: [{code: "nameRequired", field: "name", description: "The name is required."}, {code: "invalidDosing", field: "defaultDosing"}],
        }));
        expect(toApiError(error)).toEqual({
            status: 400,
            code: "nameRequired",
            errors: [
                {code: "nameRequired", field: "name", description: "The name is required."},
                {code: "invalidDosing", field: "defaultDosing", description: "invalidDosing (test)"},
            ],
            traceId: "00-test-trace-01",
            clinicNames: [],
        });
        expect(toApiError(await failWith(networkError))).toBeNull();
        expect(toApiError(new Error("not from axios"))).toBeNull();
        expect(toApiError(null)).toBeNull();
    });

    test("a body that is not a ProblemDetails keeps the status, the rest empty", async () => {
        expect(toApiError(await failWith(() => new HttpResponse("Bad gateway", {status: 502}))))
            .toEqual({status: 502, code: null, errors: [], traceId: null, clinicNames: []});
        expect(toApiError(await failWith(() => HttpResponse.json({code: 7, errors: "x", traceId: 1}, {status: 400}))))
            .toEqual({status: 400, code: null, errors: [], traceId: null, clinicNames: []});
    });

    test("error items without a string code are dropped; description and field are optional", async () => {
        const error = await failWith(() => HttpResponse.json({
            code: "nameRequired",
            errors: [{code: "nameRequired"}, {description: "no code"}, "text", null, {code: 5}, {code: "invalidText", description: 3, field: 4}],
        }, {status: 400}));
        expect(toApiError(error)?.errors).toEqual([
            {code: "nameRequired", description: ""},
            {code: "invalidText", description: ""},
        ]);
    });

    test("clinicNames are read, non-string entries dropped, missing gives [] @ERR-029", async () => {
        const named = await failWith(() => HttpResponse.json({code: "clinicSuspended", clinicNames: ["A", 3, null, "B", {}]}, {status: 403}));
        expect(toApiError(named)?.clinicNames).toEqual(["A", "B"]);
        expect(toApiError(await failWith(() => problem(403, "clinicSuspended")))?.clinicNames).toEqual([]);
        const notArray = await failWith(() => HttpResponse.json({code: "clinicSuspended", clinicNames: "A"}, {status: 403}));
        expect(toApiError(notArray)?.clinicNames).toEqual([]);
    });
});

describe("getErrorMessage @area:errors", () => {
    test("a code with an errors.<code> text gives that text, in the UI language @ERR-024", async () => {
        const error = await failWith(() => problem(409, "roleInUse"));
        expect(getErrorMessage(error)).toBe("This role is assigned to staff members. Take it away from them first.");
        await i18n.changeLanguage("ar");
        expect(getErrorMessage(error)).toBe("هذا الدور ممنوح لموظفين. أزِل هذا الدور من موظفيه أولًا.");
    });

    test("404 without a known code: not found; no answer: network; anything else: generic @ERR-025", async () => {
        expect(getErrorMessage(await failWith(() => problem(404, "routeGone")))).toBe("This item no longer exists.");
        expect(getErrorMessage(await failWith(() => new HttpResponse(null, {status: 404})))).toBe("This item no longer exists.");
        expect(getErrorMessage(await failWith(networkError))).toBe("Can't reach the server. Check your connection.");
        expect(getErrorMessage(await failWith(() => problem(400, "someNewCode")))).toBe("Something went wrong. Please try again.");
        expect(getErrorMessage(await failWith(() => new HttpResponse(null, {status: 502})))).toBe("Something went wrong. Please try again.");
        expect(getErrorMessage(new Error("boom"))).toBe("Something went wrong. Please try again.");
        await i18n.changeLanguage("ar");
        expect(getErrorMessage(await failWith(() => problem(404, "notFound")))).toBe("هذا العنصر لم يعد موجودًا.");
        expect(getErrorMessage(await failWith(networkError))).toBe("تعذّر الاتصال بالخادم. تحقّق من الاتصال.");
        expect(getErrorMessage(new Error("boom"))).toBe("حدث خطأ ما. حاول مرة أخرى.");
    });

    test("transport codes and noContexts have no text on purpose: generic @ERR-026", async () => {
        const cases: [number, string][] = [
            [401, "unauthorized"], [400, "invalidRequest"], [409, "conflict"], [405, "methodNotAllowed"], [500, "unexpected"], [401, "noContexts"],
        ];
        for (const [status, code] of cases) {
            expect(i18n.exists(`errors.${code}`)).toBe(false);
            expect(getErrorMessage(await failWith(() => problem(status, code)))).toBe("Something went wrong. Please try again.");
        }
    });

    test("clinicNames: errors.<code>_named, the names quoted and joined in the UI language @ERR-028", async () => {
        const two = await failWith(() => problem(403, "clinicSuspended", {clinicNames: ["A", "B"]}));
        const one = await failWith(() => problem(403, "staffInactive", {clinicNames: ["عيادة النور"]}));
        const three = await failWith(() => problem(403, "staffInactive", {clinicNames: ["A", "B", "C"]}));
        const unnamedSuspended = await failWith(() => problem(403, "clinicSuspended"));
        const unnamedInactive = await failWith(() => problem(403, "staffInactive"));

        expect(getErrorMessage(two)).toBe(`“${isolate("A")}” and “${isolate("B")}” are disabled.`);
        expect(getErrorMessage(one)).toBe(`Your account in “${isolate("عيادة النور")}” is deactivated. Ask the clinic owner.`);
        expect(getErrorMessage(three))
            .toBe(`Your accounts in “${isolate("A")}”, “${isolate("B")}”, and “${isolate("C")}” are deactivated. Ask the clinic owners.`);
        expect(getErrorMessage(unnamedSuspended)).toBe("This clinic is disabled.");
        expect(getErrorMessage(unnamedInactive)).toBe("Your account is deactivated. Ask the clinic owner.");

        await i18n.changeLanguage("ar");
        expect(getErrorMessage(two)).toBe(`العيادتان «${isolate("A")}» و«${isolate("B")}» موقوفتان.`);
        expect(getErrorMessage(one)).toBe(`تم إيقاف حسابك في «${isolate("عيادة النور")}». تواصل مع مالك العيادة.`);
        expect(getErrorMessage(unnamedSuspended)).toBe("هذه العيادة موقوفة.");
        expect(getErrorMessage(unnamedInactive)).toBe("تم إيقاف حسابك. تواصل مع مالك العيادة.");
    });

    test("clinicNames on a code without a _named text: the plain text", async () => {
        expect(getErrorMessage(await failWith(() => problem(403, "noAccess", {clinicNames: ["A"]}))))
            .toBe("This number has no access. Ask your clinic to add you.");
    });
});

describe("getFieldErrors, getOtherErrors, splitFormErrors @area:errors", () => {
    const createClinicError = () => failWith(() => problem(400, "nameRequired", {
        errors: [
            {code: "nameRequired", field: "name"},
            {code: "nameTooLong", field: "name"},
            {code: "invalidPhone", field: "owner.phone"},
            {code: "invalidDosing", field: "items[0].dosing"},
            {code: "someNewCode"},
            {code: "invalidDosing", field: "items[1].dosing"},
        ],
    }));

    test("each field gets the message of its first error; the others are what no input shows @ERR-027", async () => {
        const error = await createClinicError();
        expect(getFieldErrors(error)).toEqual({
            "name": "Name is required.",
            "owner.phone": "Enter a valid mobile number.",
            "items[0].dosing": "Some dosing values are missing or invalid.",
            "items[1].dosing": "Some dosing values are missing or invalid.",
        });
        expect(getOtherErrors(error, ["name", "owner.phone"])).toEqual([
            "Some dosing values are missing or invalid.",
            "Something went wrong. Please try again.",
        ]);
        await i18n.changeLanguage("ar");
        expect(getFieldErrors(error)).toMatchObject({"name": "الاسم مطلوب.", "owner.phone": "أدخل رقم موبايل صحيحًا."});
    });

    test("a field error of a code without a text reads generic", async () => {
        const error = await failWith(() => problem(400, "brandNewCode", {errors: [{code: "brandNewCode", field: "name"}]}));
        expect(getFieldErrors(error)).toEqual({name: "Something went wrong. Please try again."});
    });

    test("codes the API answers without a field can be mapped to one", async () => {
        const error = await failWith(() => problem(409, "staffExists"));
        expect(getFieldErrors(error)).toEqual({});
        expect(getFieldErrors(error, {staffExists: "phone"})).toEqual({phone: "This number already belongs to a staff member of this clinic."});
        expect(getOtherErrors(error, ["phone"], {staffExists: "phone"})).toEqual([]);
        expect(getOtherErrors(error, ["phone"])).toEqual(["This number already belongs to a staff member of this clinic."]);
    });

    test("splitFormErrors: the form's own fields, the rest to toast; no field shown: the error's message", async () => {
        const error = await createClinicError();
        expect(splitFormErrors(error, ["name", "owner.phone", "owner.fullName"])).toEqual({
            fields: {"name": "Name is required.", "owner.phone": "Enter a valid mobile number."},
            others: ["Some dosing values are missing or invalid.", "Something went wrong. Please try again."],
        });
        expect(splitFormErrors(error, ["owner.fullName"])).toEqual({fields: {}, others: ["Name is required."]});
        expect(splitFormErrors(await failWith(networkError), ["name"]))
            .toEqual({fields: {}, others: ["Can't reach the server. Check your connection."]});
        expect(getFieldErrors(new Error("x"))).toEqual({});
        expect(getOtherErrors(new Error("x"), [])).toEqual([]);
    });
});
