import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    api,
    drugsHandlers,
    findToast,
    hoverTooltip,
    isolate,
    leaveTooltip,
    networkError,
    problem,
    recordRequests,
    renderWithProviders,
    server,
} from "../../../test";
import type {Permission} from "../../access/permissions.ts";
import type {LanguageCode} from "../../../i18n/languages.ts";
import type {Drug} from "../types.ts";
import {DrugsPage} from "./DrugsPage.tsx";

// The drugs page through the cross-cutting rules: permissions (docs/features/access/tech.md "Frontend", Pages: Drugs),
// error toasts (docs/tech/overview.md "Conventions", "Data fetching"), dialogs and keyboard ("Shared components"),
// i18n ("Internationalization"; docs/features/drugs/tech.md "Frontend").


const openDrugs = async (drugs: Drug[], {lang = "ar", permissions}: { lang?: LanguageCode; permissions?: Permission[] } = {}) => {
    server.use(...drugsHandlers(drugs));
    const rendered = await renderWithProviders(<DrugsPage/>, {lang, route: "/drugs", user: permissions ? {permissions} : undefined});
    if (drugs.length) await screen.findByText(drugs[0].name);
    return rendered;
};

/** Opens «إضافة دواء» and types a name (and a description). */
const startNewDrug = async (user: Awaited<ReturnType<typeof openDrugs>>["user"], name = "Vigamox", description = "") => {
    await user.click(screen.getByRole("button", {name: "إضافة دواء"}));
    const dialog = await screen.findByRole("dialog");
    // Pasted: typing re-renders the whole form per key (slow), and typing is not what these cases test
    await user.click(within(dialog).getByRole("textbox", {name: /^الاسم/}));
    await user.paste(name);
    if (description) {
        await user.click(within(dialog).getByRole("textbox", {name: "الوصف"}));
        await user.paste(description);
    }
    return dialog;
};

describe("drugs page: permissions @area:access", () => {
    test("with drugs.list only: rows don't open and aren't focusable, the Actions column is hidden @ACC-063", async () => {
        const {user} = await openDrugs([aDrug({name: "Tobradex"})], {permissions: ["drugs.list"]});
        const row = screen.getByText("Tobradex").closest("tr")!;
        expect(row).not.toHaveAttribute("tabindex");
        await user.click(row);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.queryByRole("columnheader", {name: "الإجراءات"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "تعديل"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "إضافة دواء"})).not.toBeInTheDocument();
    });

    test("with drugs.details a row is focusable and opens the read-only details", async () => {
        const {user} = await openDrugs([aDrug({name: "Tobradex"})], {permissions: ["drugs.list", "drugs.details"]});
        const row = screen.getByText("Tobradex").closest("tr")!;
        expect(row).toHaveAttribute("tabindex", "0");
        await user.click(row);
        expect(await screen.findByRole("dialog", {name: "تفاصيل الدواء"})).toBeInTheDocument();
    });
});

describe("drugs page: errors of an action @area:errors", () => {
    test("a 500 on saving a drug: the toast «حدث خطأ ما. حاول مرة أخرى.» @ERR-022 @smoke", async () => {
        server.use(http.post(api("/drugs"), () => problem(500, "unexpected")));
        const {user} = await openDrugs([aDrug({name: "Tobradex"})]);
        await startNewDrug(user);
        await user.click(screen.getByRole("button", {name: "حفظ"}));
        expect(await findToast()).toBe("حدث خطأ ما. حاول مرة أخرى.");
    });

    test("a 500 on saving, in English: \"Something went wrong. Please try again.\" @ERR-022", async () => {
        server.use(http.put(api("/drugs/:id"), () => problem(500, "unexpected")));
        const drug = aDrug({name: "Tobradex"});
        const {user} = await openDrugs([drug], {lang: "en"});
        await user.click(screen.getByRole("button", {name: "Edit"}));
        await user.click(await screen.findByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("Something went wrong. Please try again.");
    });

    test("the API unreachable on saving: «تعذّر الاتصال بالخادم. تحقّق من الاتصال.» and the form keeps the typed data @ERR-031", async () => {
        server.use(http.post(api("/drugs"), () => networkError()));
        const {user} = await openDrugs([aDrug({name: "Tobradex"})]);
        const dialog = await startNewDrug(user, "Vigamox", "Before meals");
        await user.click(within(dialog).getByRole("button", {name: "حفظ"}));
        expect(await findToast()).toBe("تعذّر الاتصال بالخادم. تحقّق من الاتصال.");
        expect(within(dialog).getByRole("textbox", {name: /^الاسم/})).toHaveValue("Vigamox");
        expect(within(dialog).getByRole("textbox", {name: "الوصف"})).toHaveValue("Before meals");
        expect(within(dialog).getByRole("button", {name: "حفظ"})).toBeEnabled();
    });

    test("the API unreachable, in English: \"Can't reach the server. Check your connection.\" @ERR-031", async () => {
        server.use(http.post(api("/drugs"), () => networkError()));
        const {user} = await openDrugs([aDrug({name: "Tobradex"})], {lang: "en"});
        await user.click(screen.getByRole("button", {name: "Add drug"}));
        await user.click(await screen.findByRole("textbox", {name: /^Name/}));
        await user.paste("Vigamox");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("Can't reach the server. Check your connection.");
        expect(screen.getByRole("textbox", {name: /^Name/})).toHaveValue("Vigamox");
    });
});

describe("drugs page: dialogs and keyboard @area:ux", () => {
    test("Enter in the name field submits the drug dialog @UX-022", async () => {
        let created: unknown = null;
        server.use(http.post(api("/drugs"), async ({request}) => {
            created = await request.json();
            return HttpResponse.json(aDrug({name: "Vigamox"}), {status: 201});
        }));
        const {user} = await openDrugs([aDrug({name: "Tobradex"})]);
        const dialog = await startNewDrug(user);
        await user.type(within(dialog).getByRole("textbox", {name: /^الاسم/}), "{Enter}");
        await waitFor(() => expect(created).toEqual({name: "Vigamox", description: null, defaultDosing: null}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    test("Enter with an empty name follows Save's rules: «الاسم مطلوب.» and nothing is sent @UX-022", async () => {
        const {user} = await openDrugs([aDrug({name: "Tobradex"})]);
        const requests = recordRequests();
        await user.click(screen.getByRole("button", {name: "إضافة دواء"}));
        await user.type(await screen.findByRole("textbox", {name: /^الاسم/}), "{Enter}");
        expect(await screen.findByText("الاسم مطلوب.")).toBeInTheDocument();
        expect(requests.requests.filter(r => r.method === "POST")).toEqual([]);
    });

    test("Esc closes the drug dialog without saving @UX-023", async () => {
        const {user} = await openDrugs([aDrug({name: "Tobradex"})]);
        const requests = recordRequests();
        await startNewDrug(user);
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(requests.writes()).toEqual([]);
    });

    test("Esc on the delete confirmation closes it as Cancel: nothing deleted @UX-017", async () => {
        const drug = aDrug({name: "Tobradex"});
        server.use(http.get(api("/drugs/:id/groups"), () => HttpResponse.json([])));
        const {user} = await openDrugs([drug]);
        const requests = recordRequests();
        await user.click(screen.getByRole("button", {name: "حذف"}));
        const dialog = await screen.findByRole("dialog", {name: "حذف الدواء؟"});
        // The focus starts on Cancel (a destructive confirmation): Esc reaches the dialog from there
        await waitFor(() => expect(within(dialog).getByRole("button", {name: "إلغاء"})).toHaveFocus());
        await user.keyboard("{Escape}");
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        expect(requests.requests.filter(r => r.method === "DELETE")).toEqual([]);
        expect(screen.getByText("Tobradex")).toBeInTheDocument();
    });

    test("the edit and delete icons and the search clear have a tooltip and an Arabic accessible name @UX-012", async () => {
        const {user} = await openDrugs([aDrug({name: "Tobradex"})]);
        for (const name of ["تعديل", "حذف"]) {
            const button = screen.getByRole("button", {name});
            expect(await hoverTooltip(button)).toBe(name);
            await leaveTooltip(button);
        }
        await user.type(screen.getByRole("searchbox", {name: "ابحث عن دواء بالاسم…"}), "x");
        expect(await hoverTooltip(screen.getByRole("button", {name: "مسح"}))).toBe("مسح");
    });

    test("loading shows a progress bar; a new search keeps the previous rows with a thin progress bar @UX-035", async () => {
        let release!: () => void;
        const gate = new Promise<void>(resolve => (release = resolve));
        server.use(
            http.get(api("/drugs"), async ({request}) => {
                const search = new URL(request.url).searchParams.get("search");
                if (search) await gate;
                return HttpResponse.json({
                    items: [aDrug({name: search ? "Vigamox" : "Tobradex"})], totalCount: 1, page: 1, pageSize: 20,
                });
            }),
        );
        const {user} = await renderWithProviders(<DrugsPage/>, {lang: "ar", route: "/drugs"});
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
        await screen.findByText("Tobradex");
        await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());

        await user.type(screen.getByRole("searchbox"), "Vig");
        // The debounced search loads: the old rows stay under a thin bar
        expect(await screen.findByRole("progressbar")).toHaveClass("MuiLinearProgress-root");
        expect(screen.getByText("Tobradex")).toBeInTheDocument();
        release();
        expect(await screen.findByText("Vigamox")).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
    });
});

describe("drugs page in Arabic @area:i18n", () => {
    test("the pagination: «عدد الصفوف», «1–20 من 25» and Arabic button names @I18N-019", async () => {
        const drugs = Array.from({length: 25}, (_, i) => aDrug({name: `Drug ${String(i + 1).padStart(2, "0")}`}));
        const {user} = await openDrugs(drugs);
        expect(screen.getByText("عدد الصفوف")).toBeInTheDocument();
        expect(screen.getByText("1–20 من 25")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "الذهاب إلى الصفحة السابقة"})).toBeDisabled();
        await user.click(screen.getByRole("button", {name: "الذهاب إلى الصفحة التالية"}));
        expect(await screen.findByText("21–25 من 25")).toBeInTheDocument();
    });

    test("the groups using a drug are joined with the Arabic comma «، » @I18N-023", async () => {
        const drug = aDrug({name: "Tobradex"});
        server.use(http.get(api("/drugs/:id/groups"), () => HttpResponse.json(["Post cataract", "Glaucoma"])));
        const {user} = await openDrugs([drug]);
        await user.click(screen.getByRole("button", {name: "حذف"}));
        const dialog = await screen.findByRole("dialog", {name: "حذف الدواء؟"});
        expect(dialog).toHaveTextContent(`يُستخدم في هذه المجموعات: ${isolate("Post cataract، Glaucoma")}`);
    });
});
