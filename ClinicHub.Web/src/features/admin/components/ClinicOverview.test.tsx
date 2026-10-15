import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {aClinicDetails, adminClinicsHandlers, api, problem, recordRequests, server} from "../../../test";
import {renderAdmin} from "../../../test/fe-admin/adminApp.tsx";
import {holdTimers} from "../../../test/fe-admin/timers.ts";
import {fillIn} from "../../../test/fe-admin/typing.ts";

// The clinic page's Overview tab: docs/features/platform-admin/business.md "الشاشات" (صفحة العيادة: نظرة عامة، تغيير
// الاسم، الإيقاف، الحذف) and "الرسائل التي تظهر للمستخدم"; tech.md "Frontend" (ClinicOverview, RenameClinicDialog,
// DeleteClinicDialog, disabledTone.ts) and useFormatDate (long dates, Latin digits).

const header = () => screen.getByRole("heading", {level: 1});

describe("clinic Overview @area:admin", () => {
    const openOverview = async (fields: Parameters<typeof aClinicDetails>[0] = {}, lang: "ar" | "en" = "en") => {
        const clinic = aClinicDetails({name: "Demo clinic", ...fields});
        server.use(...adminClinicsHandlers([clinic]));
        const rendered = await renderAdmin(`/admin/clinics/${clinic.id}`, {lang});
        await waitFor(() => expect(header()).toHaveTextContent(clinic.name));
        const details = () => within(document.querySelector("dl") as HTMLElement);
        return {...rendered, clinic, details};
    };

    test("name, status, created date (long, Latin digits), active staff, owners with their phones @ADM-092", async () => {
        const {details} = await openOverview({
            status: "active", staffCount: 4, createdAt: "2026-10-01T09:00:00Z",
            owners: [{staffId: 7, fullName: "Dr. Sara", phone: "+201001234567"}, {staffId: 8, fullName: "Dr. Omar", phone: "+201001234568"}],
        });
        expect(details().getByText("Demo clinic")).toBeInTheDocument();
        expect(details().getByText("Active")).toBeInTheDocument();
        expect(details().getByText("October 1, 2026")).toBeInTheDocument();
        expect(details().getByText("4")).toBeInTheDocument();
        expect(details().getByText("Dr. Sara")).toBeInTheDocument();
        expect(details().getByText("+201001234567")).toBeInTheDocument();
        expect(details().getByText("Dr. Omar")).toBeInTheDocument();
    });

    test("in Arabic: «نشطة», the date «1 أكتوبر 2026» with Latin digits, the owners' phones left to right @ADM-092", async () => {
        const {details} = await openOverview({
            status: "active", createdAt: "2026-10-01T09:00:00Z",
            owners: [{staffId: 7, fullName: "د. سارة", phone: "+201001234567"}],
        }, "ar");
        expect(details().getByText("نشطة")).toBeInTheDocument();
        expect(details().getByText("1 أكتوبر 2026")).toBeInTheDocument();
        expect(details().getByText("د. سارة")).toBeInTheDocument();
        expect(details().getByText("+201001234567")).toHaveAttribute("dir", "ltr");
    });

    test("no active owner: «لا يوجد مالك نشط» / \"No active owner\" @ADM-094", async () => {
        const {details} = await openOverview({owners: []}, "ar");
        expect(details().getByText("لا يوجد مالك نشط")).toBeInTheDocument();
    });

    test("no active owner, in English @ADM-094", async () => {
        const {details} = await openOverview({owners: []});
        expect(details().getByText("No active owner")).toBeInTheDocument();
    });

    test("the \"Disabled\" chip and the Disable button use #b45309 @ADM-284", async () => {
        await openOverview({status: "active"});
        expect(screen.getByRole("button", {name: "Disable"})).toHaveStyle({color: "rgb(180, 83, 9)"});
    });

    test("a disabled clinic's chip uses #b45309 @ADM-284", async () => {
        await openOverview({status: "suspended"});
        for (const chip of screen.getAllByText("Disabled")) expect(chip.closest(".MuiChip-root")).toHaveStyle({color: "rgb(180, 83, 9)"});
    });

    describe("rename", () => {
        const puts = (requests: { method: string }[]) => requests.filter(r => r.method === "PUT");

        test("a blank name: «الاسم مطلوب.» on the input and no request @ADM-107", async () => {
            const {user} = await openOverview({}, "ar");
            const recorded = recordRequests();
            await user.click(screen.getByRole("button", {name: "تغيير الاسم"}));
            const dialog = await screen.findByRole("dialog");
            const input = within(dialog).getByRole("textbox", {name: /^اسم العيادة/});
            await user.clear(input);
            await user.type(input, "   ");
            await user.click(within(dialog).getByRole("button", {name: "حفظ"}));

            expect(input).toHaveAccessibleDescription("الاسم مطلوب.");
            expect(screen.getByRole("dialog")).toBeInTheDocument();
            expect(puts(recorded.requests)).toEqual([]);
        });

        test("a blank name in English: \"Name is required.\" @ADM-107", async () => {
            const {user} = await openOverview();
            await user.click(screen.getByRole("button", {name: "Rename"}));
            const input = within(await screen.findByRole("dialog")).getByRole("textbox", {name: /^Clinic name/});
            await user.clear(input);
            await user.click(screen.getByRole("button", {name: "Save"}));
            expect(input).toHaveAccessibleDescription("Name is required.");
        });

        test("the API answers nameInvalid: the message on the input @ADM-108", async () => {
            const {user, clinic} = await openOverview({}, "ar");
            server.use(http.put(api(`/admin/clinics/${clinic.id}`), () =>
                problem(400, "nameInvalid", {errors: [{code: "nameInvalid", field: "name"}]})));
            await user.click(screen.getByRole("button", {name: "تغيير الاسم"}));
            const dialog = await screen.findByRole("dialog");
            const input = within(dialog).getByRole("textbox", {name: /^اسم العيادة/});
            await user.type(input, " 2");
            await user.click(within(dialog).getByRole("button", {name: "حفظ"}));

            await waitFor(() => expect(input).toHaveAccessibleDescription("الاسم يحتوي على رموز غير مسموح بها."));
            expect(screen.getByRole("dialog")).toBeInTheDocument();
        });

        test("cancelled with edited text, reopened during the closing animation and after it: the current name @ADM-110", async () => {
            const {user} = await openOverview();
            const open = async () => {
                // While the dialog fades out, the page behind it is still aria-hidden
                await user.click(screen.getByRole("button", {name: "Rename", hidden: true}));
                return within(await screen.findByRole("dialog")).getByRole("textbox", {name: /^Clinic name/});
            };
            let input = await open();
            await fillIn(user, input, "Cancelled text");
            // The closing animation is held (its timers don't run) while the dialog is reopened
            const timers = holdTimers();
            await user.click(screen.getByRole("button", {name: "Cancel"}));
            const closing = screen.getByRole("dialog", {hidden: true});
            await user.click(screen.getByRole("button", {name: "Rename", hidden: true}));
            expect(screen.getByRole("dialog", {hidden: true})).toBe(closing);
            input = within(closing).getByRole("textbox", {name: /^Clinic name/, hidden: true});
            expect(input).toHaveValue("Demo clinic");
            await timers.release();

            await fillIn(user, input, "Cancelled again");
            await user.click(screen.getByRole("button", {name: "Cancel"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            input = await open();
            expect(input).toHaveValue("Demo clinic");
        });
    });

    describe("disable", () => {
        test("the confirm «إيقاف «A»؟» with what it means opens with the focus on Cancel @ADM-117", async () => {
            const {user} = await openOverview({status: "active"}, "ar");
            await user.click(screen.getByRole("button", {name: "إيقاف"}));
            const dialog = await screen.findByRole("dialog");
            expect(within(dialog).getByRole("heading")).toHaveTextContent("إيقاف «⁨Demo clinic⁩»؟");
            expect(within(dialog).getByText("يفقد موظفوها الدخول بمجرد قيامهم بأي إجراء تالٍ، حتى من يعمل داخلها الآن. لا يُحذف شيء، ويمكنك تفعيلها من جديد في أي وقت."))
                .toBeInTheDocument();
            await waitFor(() => expect(within(dialog).getByRole("button", {name: "إلغاء"})).toHaveFocus());
        });

        test("the confirm in English @ADM-117", async () => {
            const {user} = await openOverview({status: "active"});
            await user.click(screen.getByRole("button", {name: "Disable"}));
            const dialog = await screen.findByRole("dialog");
            expect(within(dialog).getByRole("heading")).toHaveTextContent("Disable “⁨Demo clinic⁩”?");
            expect(within(dialog).getByText("Its staff lose access on their next action, even if they are working in it now. Nothing is deleted, and you can enable it again at any time."))
                .toBeInTheDocument();
            await waitFor(() => expect(within(dialog).getByRole("button", {name: "Cancel"})).toHaveFocus());
        });

        test("Enter right after it opens: nothing is sent and the dialog closes @ADM-118", async () => {
            const {user} = await openOverview({status: "active"});
            const recorded = recordRequests();
            await user.click(screen.getByRole("button", {name: "Disable"}));
            const dialog = await screen.findByRole("dialog");
            await waitFor(() => expect(within(dialog).getByRole("button", {name: "Cancel"})).toHaveFocus());
            await user.keyboard("{Enter}");

            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            expect(recorded.requests.filter(r => r.method === "POST")).toEqual([]);
            expect(screen.getByRole("button", {name: "Disable"})).toBeInTheDocument();
        });
    });

    describe("delete", () => {
        const openDelete = async (name: string, lang: "ar" | "en") => {
            const rendered = await openOverview({name}, lang);
            await rendered.user.click(screen.getByRole("button", {name: lang === "ar" ? "حذف العيادة" : "Delete clinic"}));
            const dialog = await screen.findByRole("dialog");
            const input = within(dialog).getByRole("textbox", {name: lang === "ar" ? /^اسم العيادة/ : /^Clinic name/});
            const confirm = within(dialog).getByRole("button", {name: lang === "ar" ? "حذف العيادة" : "Delete clinic"});
            return {...rendered, dialog, input, confirm};
        };

        test("the dialog: «حذف هذه العيادة؟», the explanation, the name once in bold without quotes, the hint under the input @ADM-129", async () => {
            const {dialog, input} = await openDelete("Demo clinic", "ar");
            expect(within(dialog).getByRole("heading")).toHaveTextContent("حذف هذه العيادة؟");
            expect(within(dialog).getByText("تختفي العيادة من كل القوائم ويفقد موظفوها الدخول بمجرد قيامهم بأي إجراء تالٍ. تبقى بياناتها محفوظة، لكن لا يمكن استرجاعها من داخل النظام."))
                .toBeInTheDocument();
            const prompt = within(dialog).getByText("للتأكيد، اكتب اسم العيادة:", {exact: false});
            expect(prompt).toHaveTextContent("للتأكيد، اكتب اسم العيادة: Demo clinic");
            const name = within(prompt).getByText("Demo clinic");
            expect(name).toHaveStyle({fontWeight: "700"});
            expect(dialog.textContent!.split("Demo clinic")).toHaveLength(2);
            expect(dialog).not.toHaveTextContent("«");
            expect(input).toHaveAccessibleDescription("اكتب الاسم تمامًا كما يظهر");
        });

        test("the dialog in English @ADM-129", async () => {
            const {dialog, input} = await openDelete("Demo clinic", "en");
            expect(within(dialog).getByRole("heading")).toHaveTextContent("Delete this clinic?");
            expect(within(dialog).getByText("To confirm, type the clinic's name:", {exact: false})).toHaveTextContent("To confirm, type the clinic's name: Demo clinic");
            expect(dialog).not.toHaveTextContent("“");
            expect(input).toHaveAccessibleDescription("Type the name exactly as shown");
        });

        test("Delete stays disabled until the name is typed exactly (case counts); then one DELETE and back to the list @ADM-130 @smoke", async () => {
            const {user, dialog, input, confirm, clinic, location} = await openDelete("Demo clinic", "en");
            const recorded = recordRequests();
            server.use(http.delete(api(`/admin/clinics/${clinic.id}`), () => new HttpResponse(null, {status: 204})));
            expect(confirm).toBeDisabled();
            await fillIn(user, input, "demo clinic");
            expect(confirm).toBeDisabled();
            await user.clear(input);
            await fillIn(user, input, "Demo clini");
            expect(confirm).toBeDisabled();
            await user.type(input, "c");
            expect(confirm).toBeEnabled();

            await user.dblClick(within(dialog).getByRole("button", {name: "Delete clinic"}));
            await waitFor(() => expect(location().pathname).toBe("/admin"));
            expect(recorded.requests.filter(r => r.method === "DELETE")).toEqual([expect.objectContaining({path: `/admin/clinics/${clinic.id}`})]);
            expect(await screen.findByText("Clinic “⁨Demo clinic⁩” deleted")).toBeInTheDocument();
        });

        test("an Arabic name typed exactly in the Arabic UI enables Delete @ADM-133", async () => {
            const {user, input, confirm} = await openDelete("عيادة النور التخصصية", "ar");
            expect(confirm).toBeDisabled();
            await fillIn(user, input, "عيادة النور التخصصية");
            expect(confirm).toBeEnabled();
        });
    });
});
