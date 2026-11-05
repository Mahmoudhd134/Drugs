import {describe, expect, test} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {http, HttpResponse} from "msw";
import {aClinicDetails, aPrintLayout, aPrintTemplate, aTemplateItem, createTestQueryClient, problem, printTemplateHandlers, recordRequests, server, setViewportWidth} from "../../../test";
import {adminPrintTemplateApi} from "../../admin/adapters.ts";
import {
    boxOf,
    deleteButton,
    designerShown,
    measuresOf,
    paperSize,
    renderDesigner,
    renderNewSheet,
    renderPrintTemplateTab,
    saveButton,
    selectedIds,
    settingsField,
    settingsPanel,
    sheetBoxes,
    sheetItem,
    sheetSize,
    tabPath,
    templatePath,
    templateUrl,
    theSheet,
    FIELD_LABEL,
    typeInField,
} from "../../../test/pages/printTemplate.tsx";

// Which state the tab shows: contract § 3.2, § 3.6; docs: prescription-templates.business.md «تصميم القالب», «الرسائل».

const layoutL = () => aPrintLayout({
    items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"}), aTemplateItem("function", {id: "f"})],
});

const heldAnswer = () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    return {gate, release};
};

describe("print template: no template yet @area:admin", () => {
    test("the empty state with «إنشاء قالب»; pressing it shows an A5 sheet holding only the prescription text, not saved @TPL-041 @smoke", async () => {
        const recorded = recordRequests();
        const {user} = await renderPrintTemplateTab({lang: "ar"});

        expect(await screen.findByText("لا يوجد قالب طباعة لهذه العيادة.")).toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "معاينة الورقة"})).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "إنشاء قالب"}));

        await screen.findByRole("region", {name: "معاينة الورقة"});
        expect(screen.queryByText("لا يوجد قالب طباعة لهذه العيادة.")).not.toBeInTheDocument();
        expect(sheetSize()).toEqual({w: "148mm", h: "210mm"});
        expect(paperSize()).toHaveTextContent("A5");
        expect(sheetBoxes()).toHaveLength(1);
        const text = sheetItem("نص الروشتة");
        expect(measuresOf(text)).toEqual({x: "14mm", y: "80mm", w: "120mm", h: "90mm", font: "11pt"});
        expect(text).toHaveTextContent("يظهر نص الروشتة هنا");
        // Not saved, and nothing selected yet
        expect(recorded.writes()).toEqual([]);
        expect(selectedIds()).toEqual([]);
        expect(within(settingsPanel()).getByText("اختر عنصرًا على الورقة لتظهر إعداداته.")).toBeInTheDocument();
    });
});

describe("print template: loading and a failed load @area:admin", () => {
    test("while loading: a progress indicator, no empty state, no «إنشاء قالب» @TPL-215 @smoke", async () => {
        const clinic = aClinicDetails();
        const {gate, release} = heldAnswer();
        let asked = false;
        await renderPrintTemplateTab({
            clinic, lang: "ar", handlers: [http.get(templateUrl(clinic.id), async () => {
                asked = true;
                await gate;
                return new HttpResponse(null, {status: 204});
            })],
        });
        await waitFor(() => expect(asked).toBe(true));

        expect(await screen.findByRole("progressbar", {name: "جارٍ التحميل…"})).toBeInTheDocument();
        expect(screen.queryByText("لا يوجد قالب طباعة لهذه العيادة.")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "إنشاء قالب"})).not.toBeInTheDocument();

        release();
        expect(await screen.findByRole("button", {name: "إنشاء قالب"})).toBeInTheDocument();
        expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    });

    test("a 500: «تعذّر تحميل البيانات.» with Retry and no «إنشاء قالب»; Retry brings the saved template, never a blank sheet @TPL-215 @smoke", async () => {
        const clinic = aClinicDetails();
        const layout = layoutL();
        const recorded = recordRequests();
        const {user} = await renderPrintTemplateTab({clinic, lang: "ar", handlers: [http.get(templateUrl(clinic.id), () => problem(500, "unexpected"))]});

        const retry = await screen.findByRole("button", {name: "إعادة المحاولة"});
        expect(screen.getByText("تعذّر تحميل البيانات.")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "إنشاء قالب"})).not.toBeInTheDocument();
        expect(screen.queryByText("لا يوجد قالب طباعة لهذه العيادة.")).not.toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "معاينة الورقة"})).not.toBeInTheDocument();

        server.use(...printTemplateHandlers(clinic.id, {template: aPrintTemplate({layout})}));
        await user.click(retry);

        await designerShown();
        expect(sheetBoxes().map(box => box.dataset.itemId)).toEqual(["t", "m", "f"]);
        expect(screen.queryByText("تعذّر تحميل البيانات.")).not.toBeInTheDocument();
        expect(recorded.writes()).toEqual([]);
    });

    test("a copy cached earlier is never shown: the indicator until the first answer since the tab opened, then that answer @TPL-215", async () => {
        const clinic = aClinicDetails();
        const queryClient = createTestQueryClient();
        queryClient.setQueryData(adminPrintTemplateApi(clinic.id).scope, aPrintTemplate({layout: aPrintLayout({items: [aTemplateItem("prescriptionText", {id: "old"})]})}));
        const {gate, release} = heldAnswer();
        let asked = false;
        await renderPrintTemplateTab({
            clinic, queryClient, handlers: [http.get(templateUrl(clinic.id), async () => {
                asked = true;
                await gate;
                return HttpResponse.json(aPrintTemplate({layout: layoutL()}));
            })],
        });
        await waitFor(() => expect(asked).toBe(true));

        expect(await screen.findByRole("progressbar", {name: "Loading…"})).toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "Sheet preview"})).not.toBeInTheDocument();

        release();
        await designerShown();
        expect(sheetBoxes().map(box => box.dataset.itemId)).toEqual(["t", "m", "f"]);
    });
});

describe("print template: a loaded template @area:admin", () => {
    test("every item on the sheet at its mm, in order, nothing selected, Save off until something changes @TPL-219", async () => {
        const layout = aPrintLayout({
            page: {size: "A4", widthMm: 210, heightMm: 297},
            items: [
                aTemplateItem("staticText", {id: "s", text: "ثابت", xMm: 1.5, yMm: 2.5, wMm: 30.5, hMm: 9.5, fontSizePt: 10}),
                aTemplateItem("prescriptionText", {id: "t", xMm: 20, yMm: 30, wMm: 100, hMm: 50, fontSizePt: 14}),
            ],
        });
        await renderDesigner(layout);

        expect(sheetSize()).toEqual({w: "210mm", h: "297mm"});
        expect(sheetBoxes().map(box => box.dataset.itemId)).toEqual(["s", "t"]);
        expect(measuresOf(boxOf("s"))).toEqual({x: "1.5mm", y: "2.5mm", w: "30.5mm", h: "9.5mm", font: "10pt"});
        expect(measuresOf(boxOf("t"))).toEqual({x: "20mm", y: "30mm", w: "100mm", h: "50mm", font: "14pt"});
        expect(selectedIds()).toEqual([]);
        expect(saveButton()).toBeDisabled();
    });

    test("the sheet never mirrors: left to right, with its boxes placed from its left edge, in Arabic too @TPL-226", async () => {
        await renderDesigner(layoutL(), {lang: "ar"});
        expect(theSheet()).toHaveAttribute("dir", "ltr");
        expect(boxOf("m").style.left).toBe("58mm");
        expect(boxOf("m").style.right).toBe("");
    });
});

describe("print template: a new sheet and Delete @area:admin", () => {
    test("a new sheet not saved yet has no «حذف»; once saved, it shows @TPL-231", async () => {
        const {user} = await renderNewSheet({lang: "ar"});
        expect(screen.queryByRole("button", {name: "حذف"})).not.toBeInTheDocument();
        // The new sheet itself counts as unsaved: Save is on
        expect(saveButton()).toBeEnabled();

        await user.click(saveButton());

        expect(await screen.findByRole("button", {name: "حذف"})).toBeInTheDocument();
    });

    test("a loaded template shows «حذف» @TPL-231", async () => {
        await renderDesigner(layoutL(), {lang: "ar"});
        expect(deleteButton()).toHaveTextContent("حذف");
    });
});

describe("print template: desktop only @area:admin", () => {
    const message = "افتح هذه الصفحة من جهاز كمبيوتر.";

    test.each([
        ["a saved template", () => aPrintTemplate({layout: layoutL()})],
        ["no template", () => null],
    ])("at 899 px with %s: only «افتح هذه الصفحة من جهاز كمبيوتر.», no designer and no empty state @TPL-053", async (_name, template) => {
        setViewportWidth(899);
        await renderPrintTemplateTab({lang: "ar", template: template()});

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(message);
        expect(screen.queryByRole("region", {name: "معاينة الورقة"})).not.toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "إضافة إلى الورقة"})).not.toBeInTheDocument();
        expect(screen.queryByRole("region", {name: "الإعدادات"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "إنشاء قالب"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "حفظ"})).not.toBeInTheDocument();
        expect(screen.queryByText("لا يوجد قالب طباعة لهذه العيادة.")).not.toBeInTheDocument();
    });

    test("at 899 px the read still runs @TPL-053", async () => {
        setViewportWidth(899);
        const clinic = aClinicDetails();
        const recorded = recordRequests();
        await renderPrintTemplateTab({clinic});
        await screen.findByRole("alert");
        await waitFor(() => expect(recorded.requests.filter(r => r.method === "GET" && r.path === templatePath(clinic.id))).toHaveLength(1));
    });

    test("at 900 px the designer, and no message @TPL-053", async () => {
        setViewportWidth(900);
        await renderDesigner(layoutL(), {lang: "ar"});
        expect(screen.queryByText(message)).not.toBeInTheDocument();
        expect(screen.getByRole("region", {name: "إضافة إلى الورقة"})).toBeInTheDocument();
        expect(screen.getByRole("region", {name: "الإعدادات"})).toBeInTheDocument();
    });

    test("at 900 px with no template, the empty state @TPL-053", async () => {
        setViewportWidth(900);
        await renderPrintTemplateTab({lang: "ar"});
        expect(await screen.findByText("لا يوجد قالب طباعة لهذه العيادة.")).toBeInTheDocument();
    });
});

describe("print template: the tab's own URL @area:admin", () => {
    test("a deep link opens the tab @TPL-040", async () => {
        const clinic = aClinicDetails();
        const {location} = await renderPrintTemplateTab({clinic});
        expect(await screen.findByRole("tab", {name: "Print template", selected: true})).toBeInTheDocument();
        expect(location().pathname).toBe(tabPath(clinic.id));
    });

    test("editing a field doesn't change the URL @TPL-040", async () => {
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic});
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        expect(location().pathname).toBe(tabPath(clinic.id));
    });
});
