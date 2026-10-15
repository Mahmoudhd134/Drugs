import {describe, expect, test} from "vitest";
import {screen, waitFor} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {aClinicDetails, adminClinicsHandlers, api, findToast, problem, recordRequests, server} from "../../../test";
import {renderAdmin} from "../../../test/fe-admin/adminApp.tsx";
import {fillIn} from "../../../test/fe-admin/typing.ts";

// The create page: docs/features/platform-admin/business.md "الشاشات" (عيادة جديدة), "سيناريوهات الاستخدام" and
// "الرسائل التي تظهر للمستخدم"; tech.md "API" (POST /admin/clinics: 400 codes with `field` name / owner.phone /
// owner.fullName) and "Frontend" (/admin/clinics/new: CreateClinicPage).

const LABELS = {
    ar: {name: /^اسم العيادة/, phone: /^رقم موبايل المالك/, owner: /^الاسم الكامل للمالك/, submit: "إنشاء العيادة"},
    en: {name: /^Clinic name/, phone: /^Owner's mobile number/, owner: /^Owner's full name/, submit: "Create clinic"},
};

const openForm = async (lang: "ar" | "en" = "ar") => {
    const rendered = await renderAdmin("/admin/clinics/new", {lang});
    const labels = LABELS[lang];
    const name = await screen.findByRole("textbox", {name: labels.name});
    const phone = screen.getByRole("textbox", {name: labels.phone});
    const owner = screen.getByRole("textbox", {name: labels.owner});
    const submit = () => rendered.user.click(screen.getByRole("button", {name: labels.submit}));
    const fill = async (values: { name?: string; phone?: string; owner?: string }) => {
        if (values.name) await fillIn(rendered.user, name, values.name);
        if (values.phone) await fillIn(rendered.user, phone, values.phone);
        if (values.owner) await fillIn(rendered.user, owner, values.owner);
    };
    return {...rendered, name, phone, owner, submit, fill};
};

const posts = (requests: { method: string; path: string }[]) => requests.filter(r => r.method === "POST" && r.path === "/admin/clinics");

describe("create clinic: validation @area:admin", () => {
    test("submitted empty: the three required messages under their inputs, the focus on the clinic name, no request @ADM-060", async () => {
        const recorded = recordRequests();
        const form = await openForm();
        await form.user.click(form.owner);
        await form.submit();

        expect(form.name).toHaveAccessibleDescription("الاسم مطلوب.");
        expect(form.phone).toHaveAccessibleDescription("رقم الموبايل مطلوب.");
        expect(form.owner).toHaveAccessibleDescription("الاسم مطلوب.");
        await waitFor(() => expect(form.name).toHaveFocus());
        expect(posts(recorded.requests)).toHaveLength(0);
    });

    test("submitted empty, in English: \"Name is required.\" and \"Mobile number is required.\" @ADM-060", async () => {
        const form = await openForm("en");
        await form.submit();
        expect(form.name).toHaveAccessibleDescription("Name is required.");
        expect(form.phone).toHaveAccessibleDescription("Mobile number is required.");
        expect(form.owner).toHaveAccessibleDescription("Name is required.");
    });

    test("only the clinic name filled: the focus moves to the phone @ADM-061", async () => {
        const form = await openForm();
        await form.fill({name: "عيادة النور"});
        await form.submit();
        await waitFor(() => expect(form.phone).toHaveFocus());
        expect(form.name).not.toHaveAccessibleDescription("الاسم مطلوب.");
    });

    test("the API answers invalidPhone (owner.phone): the message under the phone, the focus there @ADM-062", async () => {
        server.use(http.post(api("/admin/clinics"), () =>
            problem(400, "invalidPhone", {errors: [{code: "invalidPhone", field: "owner.phone"}]})));
        const form = await openForm();
        await form.fill({name: "عيادة النور", phone: "123", owner: "د. سارة"});
        await form.submit();

        await waitFor(() => expect(form.phone).toHaveAccessibleDescription("أدخل رقم موبايل صحيحًا."));
        await waitFor(() => expect(form.phone).toHaveFocus());
        expect(form.phone).toBeEnabled();
    });

    test("the API's invalidPhone in English: \"Enter a valid mobile number.\" @ADM-062", async () => {
        server.use(http.post(api("/admin/clinics"), () =>
            problem(400, "invalidPhone", {errors: [{code: "invalidPhone", field: "owner.phone"}]})));
        const form = await openForm("en");
        await form.fill({name: "Clinic A", phone: "123", owner: "Sara"});
        await form.submit();
        await waitFor(() => expect(form.phone).toHaveAccessibleDescription("Enter a valid mobile number."));
    });

    test("the API answers nameInvalid on owner.fullName: the message under the owner name @ADM-063", async () => {
        server.use(http.post(api("/admin/clinics"), () =>
            problem(400, "nameInvalid", {errors: [{code: "nameInvalid", field: "owner.fullName"}]})));
        const form = await openForm();
        await form.fill({name: "عيادة النور", phone: "01001234567", owner: "د. سارة"});
        await form.submit();

        await waitFor(() => expect(form.owner).toHaveAccessibleDescription("الاسم يحتوي على رموز غير مسموح بها."));
        expect(form.name).not.toHaveAccessibleDescription("الاسم يحتوي على رموز غير مسموح بها.");
        await waitFor(() => expect(form.owner).toHaveFocus());
    });

    test("an error of no field (500): the toast «حدث خطأ ما. حاول مرة أخرى.» and the form keeps its values @ADM-064", async () => {
        server.use(http.post(api("/admin/clinics"), () => problem(500, "unexpected")));
        const form = await openForm();
        await form.fill({name: "عيادة النور", phone: "01001234567", owner: "د. سارة"});
        await form.submit();

        expect(await findToast()).toBe("حدث خطأ ما. حاول مرة أخرى.");
        expect(form.name).toHaveValue("عيادة النور");
        expect(form.phone).toHaveValue("01001234567");
        expect(form.owner).toHaveValue("د. سارة");
    });

    test("the 500 in English: \"Something went wrong. Please try again.\" @ADM-064", async () => {
        server.use(http.post(api("/admin/clinics"), () => problem(500, "unexpected")));
        const form = await openForm("en");
        await form.fill({name: "Clinic A", phone: "01001234567", owner: "Sara"});
        await form.submit();
        expect(await findToast()).toBe("Something went wrong. Please try again.");
    });

    test("the clinic and owner names take at most 256 characters @ADM-065", async () => {
        const form = await openForm();
        await form.user.click(form.name);
        await form.user.paste("ع".repeat(300));
        await form.user.click(form.owner);
        await form.user.paste("x".repeat(300));
        expect((form.name as HTMLInputElement).value).toHaveLength(256);
        expect((form.owner as HTMLInputElement).value).toHaveLength(256);
        expect(form.name).toHaveAttribute("maxlength", "256");
        expect(form.owner).toHaveAttribute("maxlength", "256");
    });
});

describe("create clinic: sending @area:admin", () => {
    test("while creating: the button reads «جارٍ الإنشاء…» and the inputs are disabled until the answer @ADM-086", async () => {
        let answer: () => void = () => undefined;
        const answered = new Promise<void>(resolve => {
            answer = resolve;
        });
        const created = aClinicDetails({name: "عيادة النور"});
        server.use(
            ...adminClinicsHandlers([created]),
            http.post(api("/admin/clinics"), async () => {
                await answered;
                return HttpResponse.json(created, {status: 201, headers: {Location: `/api/v1/admin/clinics/${created.id}`}});
            }),
        );
        const form = await openForm();
        await form.fill({name: "عيادة النور", phone: "01001234567", owner: "د. سارة"});
        await form.submit();

        const button = await screen.findByRole("button", {name: "جارٍ الإنشاء…"});
        expect(button).toBeDisabled();
        expect(form.name).toBeDisabled();
        expect(form.phone).toBeDisabled();
        expect(form.owner).toBeDisabled();

        answer();
        expect(await findToast()).toBe("تم إنشاء «⁨عيادة النور⁩»");
        await waitFor(() => expect(form.location().pathname).toBe(`/admin/clinics/${created.id}`));
    });

    test("the English button reads \"Creating…\" @ADM-086", async () => {
        let answer: () => void = () => undefined;
        const answered = new Promise<void>(resolve => {
            answer = resolve;
        });
        server.use(http.post(api("/admin/clinics"), async () => {
            await answered;
            return problem(500, "unexpected");
        }));
        const form = await openForm("en");
        await form.fill({name: "Clinic A", phone: "01001234567", owner: "Sara"});
        await form.submit();
        expect(await screen.findByRole("button", {name: "Creating…"})).toBeDisabled();
        answer();
        await findToast();
    });
});

describe("create clinic: what the page explains @area:admin", () => {
    test("the owner hint and the template note @ADM-089", async () => {
        await openForm();
        expect(screen.getByText("يدخل المالك برقم الموبايل هذا. إن كان للرقم حساب من قبل يُستخدم نفس الحساب.")).toBeInTheDocument();
        expect(screen.getByText("تبدأ العيادة بالأدوار الافتراضية (المالك، ⁨Doctor⁩، ⁨Assistant⁩) ونسخة من الأدوية والمجموعات الافتراضية."))
            .toBeInTheDocument();
    });

    test("in English @ADM-089", async () => {
        await openForm("en");
        expect(screen.getByText("The owner logs in with this mobile number. If this number already has an account, that account is used."))
            .toBeInTheDocument();
        expect(screen.getByText("The clinic starts with the default roles (Owner, Doctor, Assistant) and a copy of the default drugs and groups."))
            .toBeInTheDocument();
    });
});
