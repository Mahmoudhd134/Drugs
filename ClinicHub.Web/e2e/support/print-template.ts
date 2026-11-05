import {expect, type Locator, type Page} from "@playwright/test";
import type {ClinicHandle, Data} from "./data.ts";
import type {Lang} from "./texts.ts";

/**
 * The print template designer in the e2e specs (contract § 3, § 4.4). The expected texts are written out for both languages
 * (never imported from the locale files, so a changed label fails a test). Locators by the contract's accessible names;
 * a box is measured against 1 mm = 96 / 25.4 CSS px.
 */

const ar = {
    tab: "قالب الطباعة",
    desktopOnly: "افتح هذه الصفحة من جهاز كمبيوتر.",
    empty: "لا يوجد قالب طباعة لهذه العيادة.",
    create: "إنشاء قالب",
    saved: "تم حفظ القالب",
    deleted: "تم حذف القالب",
    deleteConfirm: "حذف قالب الطباعة؟ سيختفي زر «طباعة» من العيادة، ولا يمكن التراجع عن ذلك.",
    unsaved: "لديك تغييرات لم تُحفظ. هل تريد الخروج؟",
    leave: "خروج",
    panel: "إضافة إلى الورقة",
    sheet: "معاينة الورقة",
    settings: "الإعدادات",
    sampleText: "يظهر نص الروشتة هنا",
    prescriptionText: "نص الروشتة",
    manualInput: "حقل يدوي",
    staticText: "نص ثابت",
    fullDate: "التاريخ الكامل",
    paperSize: "مقاس الورق",
    sizeA4: "A4",
    sizeCustom: "مخصص",
    pageWidth: "عرض الورقة (مم)",
    pageHeight: "ارتفاع الورقة (مم)",
    name: "الاسم",
    text: "النص",
    x: "X: من اليسار (مم)",
    y: "Y: من الأعلى (مم)",
    width: "العرض (مم)",
    height: "الارتفاع (مم)",
    fontSize: "حجم الخط (نقطة)",
    removeItem: "حذف العنصر",
    home: "الذهاب إلى قائمة العيادات",
    navClinics: "العيادات",
    outside: "العنصر خارج حدود الورقة.",
};

export type PrintTemplateTexts = typeof ar;

const en: PrintTemplateTexts = {
    tab: "Print template",
    desktopOnly: "Open this page on a computer.",
    empty: "This clinic has no print template.",
    create: "Create template",
    saved: "Template saved",
    deleted: "Template deleted",
    deleteConfirm: "Delete the print template? The Print button will disappear from this clinic, and this can't be undone.",
    unsaved: "You have unsaved changes. Do you want to leave?",
    leave: "Leave",
    panel: "Add to the sheet",
    sheet: "Sheet preview",
    settings: "Settings",
    sampleText: "The prescription text appears here",
    prescriptionText: "Prescription text",
    manualInput: "Manual input",
    staticText: "Static text",
    fullDate: "Full date",
    paperSize: "Paper size",
    sizeA4: "A4",
    sizeCustom: "Custom",
    pageWidth: "Sheet width (mm)",
    pageHeight: "Sheet height (mm)",
    name: "Name",
    text: "Text",
    x: "X: from the left (mm)",
    y: "Y: from the top (mm)",
    width: "Width (mm)",
    height: "Height (mm)",
    fontSize: "Font size (pt)",
    removeItem: "Remove item",
    home: "Go to the clinics list",
    navClinics: "Clinics",
    outside: "The item is outside the sheet.",
};

export const PT_TEXTS: Record<Lang, PrintTemplateTexts> = {ar, en};

/** 1 mm in CSS px. */
export const MM = 96 / 25.4;

export const tabPath = (clinic: { id: number }) => `/admin/clinics/${clinic.id}/print-template`;
const apiPath = (clinic: { id: number }) => `/api/v1/admin/clinics/${clinic.id}/prescription-template`;

/** The API's layout (contract § 1.2). */
export type LayoutItem = {
    id: string; kind: string; function?: string; name?: string; text?: string;
    xMm: number; yMm: number; wMm: number; hMm: number; fontSizePt: number;
};
export type Layout = { schemaVersion: 1; page: { size: string; widthMm: number; heightMm: number }; items: LayoutItem[] };

export const A5 = {size: "A5", widthMm: 148, heightMm: 210};
export const A4 = {size: "A4", widthMm: 210, heightMm: 297};

export const textItem = (fields: Partial<LayoutItem> = {}): LayoutItem =>
    ({id: "t", kind: "prescriptionText", xMm: 14, yMm: 80, wMm: 120, hMm: 90, fontSizePt: 11, ...fields});
export const manualItem = (fields: Partial<LayoutItem> = {}): LayoutItem =>
    ({id: "m", kind: "manualInput", name: "الاسم", xMm: 58, yMm: 46, wMm: 72, hMm: 8, fontSizePt: 11, ...fields});
export const dateItem = (fields: Partial<LayoutItem> = {}): LayoutItem =>
    ({id: "f", kind: "function", function: "fullDate", name: "التاريخ", xMm: 14, yMm: 46, wMm: 30, hMm: 8, fontSizePt: 11, ...fields});
export const staticItem = (fields: Partial<LayoutItem> = {}): LayoutItem =>
    ({id: "s", kind: "staticText", text: "يُصرف مرة واحدة", xMm: 14, yMm: 175, wMm: 60, hMm: 8, fontSizePt: 10, ...fields});

/** The catalog's layout L (A5, a prescription text, a manual input «الاسم», a full date). */
export const layoutL = (fields: Partial<Layout> = {}): Layout =>
    ({schemaVersion: 1, page: A5, items: [textItem(), manualItem(), dateItem()], ...fields});

/** Saves the clinic's template through the API (the worker's super admin). */
export const putTemplate = (data: Data, clinic: ClinicHandle, layout: Layout) =>
    data.admin.ok<{ layout: Layout; updatedAt: string }>("PUT", apiPath(clinic), layout);

/** The clinic's template through the API; undefined when none (204). */
export const getTemplate = (data: Data, clinic: ClinicHandle) =>
    data.admin.ok<{ layout: Layout; updatedAt: string } | undefined>("GET", apiPath(clinic));

/** The designer's parts in the UI's language. */
export const designerOf = (page: Page, lang: Lang) => {
    const pt = PT_TEXTS[lang];
    const settings = page.getByRole("region", {name: pt.settings, exact: true});
    const area = page.getByRole("region", {name: pt.sheet, exact: true});
    return {
        pt,
        panel: page.getByRole("region", {name: pt.panel, exact: true}),
        area,
        settings,
        sheet: page.getByTestId("template-sheet"),
        box: (id: string) => page.getByTestId("template-sheet").locator(`[data-item-id="${id}"]`),
        boxes: page.getByTestId("template-sheet").locator("[data-item-id]"),
        entry: (name: string) => page.getByRole("region", {name: pt.panel, exact: true}).getByRole("button", {name, exact: true}),
        field: (name: string) => settings.getByRole("textbox", {name, exact: true}),
        paperSize: settings.getByRole("combobox", {name: new RegExp(`^${pt.paperSize}`)}),
        create: page.getByRole("button", {name: pt.create, exact: true}),
        question: page.getByRole("dialog", {name: pt.unsaved, exact: true}),
        deleteQuestion: page.getByRole("dialog", {name: pt.deleteConfirm, exact: true}),
    };
};

export type Designer = ReturnType<typeof designerOf>;

/** The tab with its designer on screen (a saved template or a new sheet shown). */
export const designerShown = async (designer: Designer) => {
    await expect(designer.sheet).toBeVisible();
};

/** A box's place and size in mm, measured from the sheet's top-left corner on the screen. */
export const placeOf = async (box: Locator, sheet: Locator) => {
    const [b, s] = await Promise.all([box.boundingBox(), sheet.boundingBox()]);
    if (!b || !s) throw new Error("the box or the sheet isn't on screen");
    return {x: (b.x - s.x) / MM, y: (b.y - s.y) / MM, w: b.width / MM, h: b.height / MM};
};

export const expectClose = (actual: { x: number; y: number; w: number; h: number }, expected: { x: number; y: number; w: number; h: number }, what: string, within = 0.1) => {
    for (const key of ["x", "y", "w", "h"] as const) {
        expect(Math.abs(actual[key] - expected[key]), `${what}: ${key} is ${actual[key]} mm, expected ${expected[key]} mm`).toBeLessThanOrEqual(within);
    }
};

/** Types like a person: the page gets a user activation, which the browser's leave prompt needs. */
export const typeInto = async (field: Locator, text: string) => {
    await field.click();
    await field.press("ControlOrMeta+a");
    await field.press("Delete");
    await field.pressSequentially(text);
};

/** The box's inline value, e.g. `left` → "12.5mm" (true mm, never flipped by the RTL style cache). */
export const inlineStyle = (box: Locator, property: "left" | "top" | "width" | "height" | "fontSize") =>
    box.evaluate((element, name) => (element as HTMLElement).style[name], property);
