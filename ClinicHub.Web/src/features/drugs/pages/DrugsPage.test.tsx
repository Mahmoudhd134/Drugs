import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http, HttpResponse} from "msw";
import {
    aDrug,
    api,
    drugsHandlers,
    isolate,
    networkError,
    problem,
    recordRequests,
    renderWithProviders,
    server,
} from "../../../test";
import type {Drug} from "../types.ts";
import {DrugsPage} from "./DrugsPage.tsx";

// The drugs page: docs/features/drugs/business.md ("البحث", "حذف دواء", "الرسائل") and tech.md "Frontend" (DrugsPage,
// DrugText, delete confirmation) and "Edge cases"; texts from ar.ts / en.ts.

const manyDrugs = (count: number) => Array.from({length: count}, (_, i) => aDrug({name: `Drug ${String(i + 1).padStart(2, "0")}`}));

const openPage = async (drugs: Drug[], lang: "ar" | "en" = "ar") => {
    server.use(...drugsHandlers(drugs));
    const rendered = await renderWithProviders(<DrugsPage/>, {lang});
    return rendered;
};

/** The table row of a drug, by its name. */
const rowOf = async (name: string) => (await screen.findByText(name)).closest("tr") as HTMLElement;
const confirmText = () => within(screen.getByRole("dialog")).getByText(/./, {selector: "p"}).textContent;

describe("drugs page: the list @area:catalog", () => {
    test("the subtitle reads «إجمالي الأدوية: N» with N = the total count @DRUG-053", async () => {
        await openPage(manyDrugs(25));
        expect(await screen.findByText("إجمالي الأدوية: 25")).toBeInTheDocument();
        // 25 in total, 20 on this page
        expect(screen.getAllByRole("row")).toHaveLength(21);
    });

    test("in English the subtitle reads \"Total drugs: N\" @DRUG-053", async () => {
        await openPage(manyDrugs(3), "en");
        expect(await screen.findByText("Total drugs: 3")).toBeInTheDocument();
    });

    test("no drugs at all: «لا توجد أدوية بعد» / «أضف أول دواء…» with an «إضافة دواء» button @DRUG-055", async () => {
        const {user} = await openPage([]);
        const title = await screen.findByText("لا توجد أدوية بعد");
        const empty = title.parentElement as HTMLElement;
        expect(within(empty).getByText("أضف أول دواء لتبدأ في كتابة الروشتات.")).toBeInTheDocument();
        await user.click(within(empty).getByRole("button", {name: "إضافة دواء"}));
        expect(await screen.findByRole("heading", {name: "دواء جديد"})).toBeInTheDocument();
    });

    test("in English the empty state reads \"No drugs yet\" @DRUG-055", async () => {
        await openPage([], "en");
        expect(await screen.findByText("No drugs yet")).toBeInTheDocument();
        expect(screen.getByText("Add your first drug to start building prescriptions.")).toBeInTheDocument();
    });

    test("a row shows the name, the Arabic dosing sentence and the description cut to 2 lines @DRUG-056 @smoke", async () => {
        const description = "سطر 1\nسطر 2\nسطر 3\nسطر 4";
        await openPage([aDrug({
            name: "Tobradex",
            description,
            defaultDosing: {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationUnit: "weeks", durationValue: 2},
        })], "en");
        const row = await rowOf("Tobradex");
        expect(within(row).getByText("نقطة واحدة 4 مرات يوميًا لمدة أسبوعين")).toBeInTheDocument();
        const text = within(row).getByText((_, el) => el?.textContent === description && el.tagName === "P");
        expect(text).toHaveStyle({display: "-webkit-box", overflow: "hidden", whiteSpace: "pre-line"});
        expect(getComputedStyle(text).getPropertyValue("-webkit-line-clamp")).toBe("2");
    });

    test("a default dosing of only «اليمنى»: «في العين اليمنى» and the description in the table @DRUG-103", async () => {
        await openPage([aDrug({name: "Tobradex", description: "Antibiotic + steroid", defaultDosing: {eye: "right"}})]);
        const row = await rowOf("Tobradex");
        expect(within(row).getByText("في العين اليمنى")).toBeInTheDocument();
        expect(within(row).getByText("Antibiotic + steroid")).toBeInTheDocument();
    });

    test("the list fails to load: «تعذّر تحميل البيانات.» with «إعادة المحاولة», which reloads @DRUG-057", async () => {
        let fail = true;
        server.use(
            http.get(api("/drugs"), () => (fail ? problem(500, "unexpected") : HttpResponse.json({items: [aDrug({name: "Vigamox"})], totalCount: 1, page: 1, pageSize: 20}))),
        );
        const {user} = await renderWithProviders(<DrugsPage/>, {lang: "ar"});
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("تعذّر تحميل البيانات.");
        fail = false;
        await user.click(within(alert).getByRole("button", {name: "إعادة المحاولة"}));
        expect(await screen.findByText("Vigamox")).toBeInTheDocument();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    test("in English the load error reads \"Couldn't load data.\" with \"Retry\" @DRUG-057", async () => {
        server.use(http.get(api("/drugs"), () => networkError()));
        await renderWithProviders(<DrugsPage/>, {lang: "en"});
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("Couldn't load data.");
        expect(within(alert).getByRole("button", {name: "Retry"})).toBeInTheDocument();
    });
});

describe("drugs page: the edit dialog @area:catalog", () => {
    test("cancelled after changes, the dialog opens again with the saved values @DRUG-068", async () => {
        const recorded = recordRequests();
        const {user} = await openPage([aDrug({name: "Tobradex", description: "Antibiotic + steroid"})]);
        await user.click(await rowOf("Tobradex"));
        const name = await screen.findByRole("textbox", {name: "الاسم"});
        await user.clear(name);
        await user.type(name, "Changed");
        await user.clear(screen.getByRole("textbox", {name: "الوصف"}));
        await user.click(screen.getByRole("button", {name: "إلغاء"}));
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await user.click(await rowOf("Tobradex"));
        expect(await screen.findByRole("heading", {name: "تعديل الدواء"})).toBeInTheDocument();
        expect(screen.getByRole("textbox", {name: "الاسم"})).toHaveValue("Tobradex");
        expect(screen.getByRole("textbox", {name: "الوصف"})).toHaveValue("Antibiotic + steroid");
        expect(recorded.writes()).toEqual([]);
    });
});

describe("drugs page: delete with the groups warning @area:catalog", () => {
    const groupsOf = (names: string[] | "fail" | "network") => http.get(api("/drugs/:id/groups"), () =>
        names === "fail" ? problem(500, "unexpected") : names === "network" ? networkError() : HttpResponse.json(names));

    const clickDelete = async (user: UserEvent, name: string, lang: "ar" | "en" = "ar") => {
        const row = await rowOf(name);
        await user.click(within(row).getByRole("button", {name: lang === "ar" ? "حذف" : "Delete"}));
        return screen.findByRole("dialog");
    };

    test("a drug in no group: only the first sentence, no groups line @DRUG-080", async () => {
        server.use(groupsOf([]));
        const page = await openPage([aDrug({name: "Tobradex"})]);
        const dialog = await clickDelete(page.user, "Tobradex");
        expect(within(dialog).getByRole("heading", {name: "حذف الدواء؟"})).toBeInTheDocument();
        expect(confirmText()).toBe(`سيتم حذف «${isolate("Tobradex")}» وإزالته من كل المجموعات. لا يمكن التراجع عن ذلك.`);
        expect(within(dialog).queryByText(/يُستخدم في هذه المجموعات/)).not.toBeInTheDocument();
    });

    test("in English, a drug in no group: \"“Tobradex” will be deleted…\" only @DRUG-080", async () => {
        server.use(groupsOf([]));
        const page = await openPage([aDrug({name: "Tobradex"})], "en");
        await clickDelete(page.user, "Tobradex", "en");
        expect(confirmText()).toBe(`“${isolate("Tobradex")}” will be deleted and removed from every group. This can't be undone.`);
    });

    test("English UI, two groups: \"It is used in these groups: A، B\" (the Arabic comma in both languages) @DRUG-081", async () => {
        server.use(groupsOf(["Post cataract", "التهاب الملتحمة"]));
        const page = await openPage([aDrug({name: "Tobradex"})], "en");
        await clickDelete(page.user, "Tobradex", "en");
        expect(confirmText()).toBe([
            `“${isolate("Tobradex")}” will be deleted and removed from every group. This can't be undone.`,
            `It is used in these groups: ${isolate("Post cataract، التهاب الملتحمة")}`,
        ].join("\n"));
    });

    test("the group names lookup fails (500 or network): the confirmation still opens, without the groups line @DRUG-082", async () => {
        for (const failure of ["fail", "network"] as const) {
            server.use(groupsOf(failure));
            const page = await openPage([aDrug({name: "Tobradex"})]);
                const dialog = await clickDelete(page.user, "Tobradex");
            expect(confirmText()).toBe(`سيتم حذف «${isolate("Tobradex")}» وإزالته من كل المجموعات. لا يمكن التراجع عن ذلك.`);
            expect(within(dialog).getByRole("button", {name: "حذف"})).toBeInTheDocument();
            page.unmount();
        }
    });

    test("deleting the only row of the last page steps back one page @DRUG-085", async () => {
        const drugs = manyDrugs(21);
        server.use(
            groupsOf([]),
            http.delete(api("/drugs/:id"), ({params}) => {
                drugs.splice(drugs.findIndex(d => d.id === Number(params.id)), 1);
                return new HttpResponse(null, {status: 204});
            }),
        );
        const page = await openPage(drugs);
        await rowOf("Drug 01");
        await page.user.click(screen.getByRole("button", {name: "الذهاب إلى الصفحة التالية"}));
        expect(await screen.findByText("Drug 21")).toBeInTheDocument();
        expect(screen.getByText("21–21 من 21")).toBeInTheDocument();

        const dialog = await clickDelete(page.user, "Drug 21");
        await page.user.click(within(dialog).getByRole("button", {name: "حذف"}));
        expect(await screen.findByText("1–20 من 20")).toBeInTheDocument();
        expect(screen.getByText("Drug 01")).toBeInTheDocument();
        expect(screen.queryByText("Drug 21")).not.toBeInTheDocument();
    });
});
