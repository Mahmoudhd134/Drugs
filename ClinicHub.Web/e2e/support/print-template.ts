import {expect, type Locator, type Page} from "@playwright/test";
import type {ClinicHandle, Data} from "./data.ts";
import {settled, signInSuperAdmin} from "./fixtures.ts";
import {type Lang, TEXTS} from "./texts.ts";
import {expectToast} from "./ui.ts";

/**
 * The print template designer in the e2e specs (contract § 3, § 4.4). The expected texts are written out for both languages
 * (never imported from the locale files, so a changed label fails a test). Locators by the contract's accessible names;
 * a box is measured against 1 mm = 96 / 25.4 CSS px at 100% zoom (`zoomTo`). The drag helpers (step 3 contract § 4.2) are at the end.
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
    undo: "تراجع",
    redo: "إعادة",
    zoomOut: "تصغير",
    zoomIn: "تكبير",
    fit: "ملاءمة",
    internalData: "بيانات داخلية",
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
    undo: "Undo",
    redo: "Redo",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    fit: "Fit",
    internalData: "Internal data",
};

export const PT_TEXTS: Record<Lang, PrintTemplateTexts> = {ar, en};

/** 1 mm in CSS px. */
export const MM = 96 / 25.4;

export const tabPath = (clinic: { id: number }) => `/admin/clinics/${clinic.id}/print-template`;
export const apiPath = (clinic: { id: number }) => `/api/v1/admin/clinics/${clinic.id}/prescription-template`;

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

/** A manual input's name at the limit of 60 characters, this number telling it from the others: too long for one line on a phone. */
export const longManualName = (number = 1) => `الاسم بالكامل كما هو مكتوب في بطاقة الرقم القومي الخاص به ${String(number).padStart(2, "0")}`;

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
        save: page.getByRole("button", {name: TEXTS[lang].save, exact: true}),
        question: page.getByRole("dialog", {name: pt.unsaved, exact: true}),
        deleteQuestion: page.getByRole("dialog", {name: pt.deleteConfirm, exact: true}),
        // Step 3 (contract § 3.2, § 3.3)
        undo: page.getByRole("button", {name: pt.undo, exact: true}),
        redo: page.getByRole("button", {name: pt.redo, exact: true}),
        zoomOut: page.getByRole("button", {name: pt.zoomOut, exact: true}),
        zoomIn: page.getByRole("button", {name: pt.zoomIn, exact: true}),
        fit: page.getByRole("button", {name: pt.fit, exact: true}),
        zoomPercent: page.getByTestId("template-zoom-percent"),
        frame: page.getByTestId("template-sheet-frame"),
        handle: (id: string) => page.getByTestId(`template-handle-${id}`),
        handles: page.locator("[data-handle]"),
        guides: page.getByTestId("template-guide"),
        ghost: page.getByTestId("template-drag-ghost"),
        toolbar: page.getByTestId("template-toolbar"),
        overlay: page.getByTestId("template-overlay"),
    };
};

export type Designer = ReturnType<typeof designerOf>;

/** The tab with its designer on screen (a saved template or a new sheet shown). */
export const designerShown = async (designer: Designer) => {
    await expect(designer.sheet).toBeVisible();
};

/** Plus or minus until the percentage shows `percent`, a multiple of 25 from 50 to 200 (step 3 § 3 "Zoom"): true size is 100. */
export const zoomTo = async (designer: Designer, percent: number) => {
    await expect(designer.zoomPercent).toHaveText(/^\d+%$/);
    for (let presses = 0; presses < 10; presses++) {
        const shown = parseInt((await designer.zoomPercent.textContent()) ?? "", 10);
        if (shown === percent) return;
        await (shown < percent ? designer.zoomIn : designer.zoomOut).click();
    }
    await expect(designer.zoomPercent).toHaveText(`${percent}%`);
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

/*
 * Step 3: the drag helpers (contract § 4.2). Real `page.mouse`, whole pixels, so a position never depends on how the browser
 * treats a fraction of a pixel; screen targets come from the sheet's rectangle, so they hold at any zoom and scroll. Exact mm come
 * from the boxes' inline styles, which also show a drag's preview (contract § 3.4).
 */

export const COMPUTER_ONLY = "the designer is for a computer";
export const ONE_LANGUAGE = "the rule doesn't depend on the language: the Arabic UI, the harder one, only";

export type MmBox = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type MouseButton = "left" | "right" | "middle";

/** A box's place and size, in exact mm: its inline styles. */
export const boxMm = (box: Locator): Promise<MmBox> => box.evaluate(element => {
    const {left, top, width, height} = (element as HTMLElement).style;
    return {x: parseFloat(left), y: parseFloat(top), w: parseFloat(width), h: parseFloat(height)};
});

/** The box comes to these exact mm (a drag's preview too); only the keys given. */
export const expectMm = async (box: Locator, expected: Partial<MmBox>, what = "the box") => {
    const keys = Object.keys(expected) as (keyof MmBox)[];
    await expect.poll(async () => {
        const now = await boxMm(box);
        return Object.fromEntries(keys.map(key => [key, now[key]]));
    }, {message: `${what}: its place and size in mm`}).toEqual(expected);
};

export type SheetOnScreen = { left: number; top: number; right: number; bottom: number; widthMm: number; heightMm: number; pxPerMm: number };

/** The sheet's rectangle on the screen now (zoom and scroll in it), and how many screen px make 1 mm. */
export const sheetOnScreen = (designer: Designer): Promise<SheetOnScreen> => designer.sheet.evaluate(element => {
    const {left, top, right, bottom, width} = element.getBoundingClientRect();
    const widthMm = parseFloat((element as HTMLElement).style.width);
    const heightMm = parseFloat((element as HTMLElement).style.height);
    return {left, top, right, bottom, widthMm, heightMm, pxPerMm: width / widthMm};
});

/** The zoom in force, in percent to one decimal, not rounded to whole as the toolbar shows it: from the frame's width. */
export const trueZoom = async (designer: Designer) => {
    const [frame, {widthMm}] = await Promise.all([designer.frame.boundingBox(), sheetOnScreen(designer)]);
    if (!frame) throw new Error("the sheet's frame isn't on screen");
    return Math.round(frame.width / (widthMm * MM) * 1000) / 10;
};

/** A press in progress: the pointer's moves up to the release. */
export type Gesture = {
    /** Where the press was */
    start: Point;
    /** The pointer now */
    now: () => Point;
    /** How far the pressed spot lies from what the gesture moves (the box's top-left, a handle's edges), in mm */
    grab: { xMm: number; yMm: number };
    /** To this offset in px from the press */
    by: (dx: number, dy: number, steps?: number) => Promise<void>;
    /** To this point on the screen */
    to: (point: Point, steps?: number) => Promise<void>;
    /** So that what the gesture moves comes to these raw mm on the sheet, wherever the sheet is on screen now */
    toMm: (xMm: number, yMm: number, steps?: number) => Promise<void>;
    release: () => Promise<void>;
};

const startGesture = async (page: Page, designer: Designer, at: Point, moved: { xMm: number; yMm: number } | null, button: MouseButton): Promise<Gesture> => {
    const start = {x: Math.round(at.x), y: Math.round(at.y)};
    const sheet = await sheetOnScreen(designer);
    const grab = moved
        ? {xMm: (start.x - sheet.left) / sheet.pxPerMm - moved.xMm, yMm: (start.y - sheet.top) / sheet.pxPerMm - moved.yMm}
        : {xMm: 0, yMm: 0};
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({button});
    let now = start;
    const to = async (point: Point, steps = 1) => {
        now = {x: Math.round(point.x), y: Math.round(point.y)};
        await page.mouse.move(now.x, now.y, {steps});
    };
    return {
        start,
        now: () => now,
        grab,
        by: (dx, dy, steps) => to({x: start.x + dx, y: start.y + dy}, steps),
        to,
        toMm: async (xMm, yMm, steps) => {
            const current = await sheetOnScreen(designer);
            await to({
                x: current.left + (xMm + grab.xMm) * current.pxPerMm,
                y: current.top + (yMm + grab.yMm) * current.pxPerMm,
            }, steps);
        },
        release: () => page.mouse.up({button}),
    };
};

/**
 * A press on a box, by default a quarter along its width and halfway down: on a selected box no handle lies there, however
 * thin (`fx`, `fy` to press elsewhere).
 */
export const pressBox = async (page: Page, designer: Designer, id: string, options: { fx?: number; fy?: number; button?: MouseButton } = {}) => {
    const box = designer.box(id);
    await box.scrollIntoViewIfNeeded();
    const [rect, place] = await Promise.all([box.boundingBox(), boxMm(box)]);
    if (!rect) throw new Error(`the box ${id} isn't on screen`);
    const at = {x: rect.x + rect.width * (options.fx ?? 0.25), y: rect.y + rect.height * (options.fy ?? 0.5)};
    return startGesture(page, designer, at, {xMm: place.x, yMm: place.y}, options.button ?? "left");
};

/** A press at this point of the sheet, for a gesture moving the box `id` (the one on top there). */
export const pressSheetAt = async (page: Page, designer: Designer, id: string, xMm: number, yMm: number) => {
    const [sheet, place] = await Promise.all([sheetOnScreen(designer), boxMm(designer.box(id))]);
    const at = {x: sheet.left + xMm * sheet.pxPerMm, y: sheet.top + yMm * sheet.pxPerMm};
    return startGesture(page, designer, at, {xMm: place.x, yMm: place.y}, "left");
};

/** A press on a handle of the selected box `id`. `toMm` then takes where its edges go: for `n` and `s` the box's middle stays as x, for `e` and `w` as y. */
export const pressHandle = async (page: Page, designer: Designer, id: string, handle: string, options: { button?: MouseButton } = {}) => {
    const [rect, place] = await Promise.all([designer.handle(handle).boundingBox(), boxMm(designer.box(id))]);
    if (!rect) throw new Error(`the handle ${handle} isn't on screen`);
    const edgeX = handle.includes("w") ? place.x : handle.includes("e") ? place.x + place.w : place.x + place.w / 2;
    const edgeY = handle.includes("n") ? place.y : handle.includes("s") ? place.y + place.h : place.y + place.h / 2;
    return startGesture(page, designer, {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}, {xMm: edgeX, yMm: edgeY}, options.button ?? "left");
};

/** A press on a panel entry. `toMm` takes where the pointer goes: the ghost's top-left is there (contract § 6.12). */
export const pressEntry = async (page: Page, designer: Designer, name: string, options: { button?: MouseButton } = {}) => {
    const rect = await designer.entry(name).boundingBox();
    if (!rect) throw new Error(`the entry ${name} isn't on screen`);
    return startGesture(page, designer, {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2}, null, options.button ?? "left");
};

/** The box lies under the pointer, the pressed spot still where it was on it, within `withinMm` (a snap's or a guide's reach). */
export const expectUnderPointer = async (designer: Designer, box: Locator, gesture: Gesture, withinMm = 1.1) => {
    await expect.poll(async () => {
        const [rect, sheet] = await Promise.all([box.boundingBox(), sheetOnScreen(designer)]);
        if (!rect) return Number.POSITIVE_INFINITY;
        const pointer = gesture.now();
        return Math.max(
            Math.abs(pointer.x - gesture.grab.xMm * sheet.pxPerMm - rect.x),
            Math.abs(pointer.y - gesture.grab.yMm * sheet.pxPerMm - rect.y),
        ) / sheet.pxPerMm;
    }, {message: "the box under the pointer, in mm off"}).toBeLessThanOrEqual(withinMm);
};

/**
 * A pixel column where a drag's raw x lies within 0.8 mm of `lineMm`, so a snap or a guide would change it, and off both whole mm and
 * the line, so only an unsnapped value can be there: `tenth` is what Alt stores (`grabMm`: `gesture.grab.xMm`).
 */
export const offGridColumn = (sheet: SheetOnScreen, grabMm: number, lineMm: number) => {
    const center = sheet.left + (lineMm + grabMm) * sheet.pxPerMm;
    for (let px = Math.floor(center - sheet.pxPerMm); px <= Math.ceil(center + sheet.pxPerMm); px++) {
        const raw = (px - sheet.left) / sheet.pxPerMm - grabMm;
        const tenth = Math.round(raw * 10) / 10;
        const part = tenth - Math.floor(tenth);
        if (Math.abs(raw - lineMm) <= 0.8 && part >= 0.2 && part <= 0.8 && Math.abs(tenth - lineMm) >= 0.2) return {px, tenth};
    }
    throw new Error(`no pixel column near ${lineMm} mm at ${sheet.pxPerMm} px per mm`);
};

/** A value stored with one decimal, within 0.1 of what Alt should store, not a whole mm. */
export const expectOneDecimalNear = (value: number, tenth: number, what: string) => {
    expect(Math.abs(value - tenth), `${what}: ${value} mm, expected about ${tenth} mm`).toBeLessThanOrEqual(0.1 + 1e-9);
    expect(Math.abs(value * 10 - Math.round(value * 10)), `${what}: ${value} mm holds one decimal`).toBeLessThan(1e-9);
    expect(Number.isInteger(value), `${what}: ${value} mm isn't snapped to a whole mm`).toBe(false);
};

/** Exactly one guide line, on this axis at this value. */
export const expectGuide = async (designer: Designer, axis: "x" | "y", mm: number) => {
    await expect(designer.guides).toHaveCount(1);
    await expect(designer.guides).toHaveAttribute("data-axis", axis);
    await expect(designer.guides).toHaveAttribute("data-mm", String(mm));
};

/** The ids of the handles on screen, in the order they are drawn. */
export const handleIds = (designer: Designer) =>
    designer.handles.evaluateAll(all => all.map(handle => (handle as HTMLElement).dataset.handle ?? ""));

/** What a press at this point of the screen would reach. */
export const hitAt = (page: Page, point: Point) => page.evaluate(({x, y}) => {
    const hit = document.elementFromPoint(x, y);
    return {
        handle: hit?.closest("[data-handle]")?.getAttribute("data-handle") ?? null,
        item: hit?.closest("[data-item-id]")?.getAttribute("data-item-id") ?? null,
    };
}, point);

/** Every handle on screen is at least 8 px square, and a press anywhere on it (its center, near its corners) reaches it. */
export const expectFullHandleTargets = async (designer: Designer, what: string) => {
    const broken = await designer.handles.evaluateAll(all => all.flatMap(handle => {
        const id = (handle as HTMLElement).dataset.handle;
        const rect = handle.getBoundingClientRect();
        const [cx, cy] = [rect.left + rect.width / 2, rect.top + rect.height / 2];
        const covered = [[0, 0], [-3, -3], [3, -3], [3, 3], [-3, 3]]
            .filter(([dx, dy]) => document.elementFromPoint(cx + dx, cy + dy)?.closest("[data-handle]") !== handle)
            .map(([dx, dy]) => `${id}: ${dx}, ${dy} from its center doesn't reach it`);
        return rect.width < 8 || rect.height < 8 ? [`${id}: ${rect.width} x ${rect.height} px`, ...covered] : covered;
    }));
    expect(broken, `${what}: full handle targets`).toEqual([]);
};

/** A synthetic pointer event, only where a real mouse can't produce the case (contract § 4.2). `pointerId`: Chromium's mouse is always 1. */
export const syntheticPointer = (target: Locator, type: "pointercancel" | "pointermove" | "lostpointercapture", init: Record<string, number> = {}) =>
    target.dispatchEvent(type, {pointerId: 1, pointerType: "mouse", isPrimary: true, ...init});

export type AreaScroll = { left: number; top: number; maxLeft: number; maxTop: number };

export const areaScroll = (designer: Designer): Promise<AreaScroll> => designer.area.evaluate(area => ({
    left: area.scrollLeft, top: area.scrollTop, maxLeft: area.scrollWidth - area.clientWidth, maxTop: area.scrollHeight - area.clientHeight,
}));

export const scrollAreaTo = async (designer: Designer, left: number, top: number) => {
    await designer.area.evaluate((area, to) => area.scrollTo(to.left, to.top), {left, top});
};

/** The area scrolled so this point of the sheet is in its middle, away from the auto-scroll band. */
export const centerAreaOn = async (designer: Designer, xMm: number, yMm: number) => {
    const {pxPerMm} = await sheetOnScreen(designer);
    await designer.area.evaluate((area, to) => {
        const padding = parseFloat(getComputedStyle(area).paddingLeft);
        area.scrollTo(to.x + padding - area.clientWidth / 2, to.y + padding - area.clientHeight / 2);
    }, {x: xMm * pxPerMm, y: yMm * pxPerMm});
};

export const areaRect = async (designer: Designer) => {
    const rect = await designer.area.boundingBox();
    if (!rect) throw new Error("the sheet's area isn't on screen");
    return rect;
};

/** Fit in force: the whole sheet shows with no scroll, and it fills the area's inner size on one side at least. */
export const expectFit = async (designer: Designer, what: string) => {
    await expect.poll(() => designer.area.evaluate(area => {
        const frame = area.querySelector("[data-testid=template-sheet-frame]")!.getBoundingClientRect();
        const padding = parseFloat(getComputedStyle(area).paddingLeft);
        const fill = Math.max(frame.width / (area.clientWidth - 2 * padding), frame.height / (area.clientHeight - 2 * padding));
        return {
            scrolls: area.scrollWidth > area.clientWidth || area.scrollHeight > area.clientHeight,
            fills: fill >= 0.97 && fill <= 1.001,
        };
    }), {message: `${what}: the whole sheet shows, filling the area`}).toEqual({scrolls: false, fills: true});
};

/** Tab until the target has the focus. */
export const tabTo = async (page: Page, target: Locator) => {
    for (let presses = 0; presses < 80; presses++) {
        if (await target.evaluate(element => element === document.activeElement)) return;
        await page.keyboard.press("Tab");
    }
    await expect(target).toBeFocused();
};

/**
 * A5: the prescription text out of the way and a manual input `m` of 40 x 8 mm at 40, 20. Its free cells, where no guide is in
 * reach and a drag lands on whole mm: x 40, 42, 44, 60, 62, 80, 82, 100; y 10, 20 … 80.
 */
export const plainLayout = (m: Partial<LayoutItem> = {}, ...others: LayoutItem[]): Layout => ({
    schemaVersion: 1,
    page: A5,
    items: [textItem({xMm: 10, yMm: 100, wMm: 120, hMm: 90}), manualItem({xMm: 40, yMm: 20, wMm: 40, hMm: 8, ...m}), ...others],
});

/** `plainLayout` with a date whose left edge is at 62.3, so a guide can be told from a whole mm: `m` sticks at x = 63, snaps at x = 64. */
export const guideLayout = (): Layout => plainLayout({}, dateItem({xMm: 62.3, yMm: 60, wMm: 30, hMm: 8}));

/** A custom page: the prescription text and these items. */
export const customLayout = (widthMm: number, heightMm: number, ...items: LayoutItem[]): Layout => ({
    schemaVersion: 1,
    page: {size: "custom", widthMm, heightMm},
    items: [textItem(), ...items],
});

/** 50 items on A4, the limit: a prescription text at y = 200 and 49 manual inputs `m0`…`m48`, 7 x 7 from the top-left. */
export const fiftyItems = (): Layout => ({
    schemaVersion: 1,
    page: A4,
    items: [
        textItem({xMm: 14, yMm: 200, wMm: 120, hMm: 90}),
        ...Array.from({length: 49}, (_, index) => manualItem({
            id: `m${index}`, name: `حقل ${index}`, xMm: 5 + 28 * (index % 7), yMm: 5 + 12 * Math.floor(index / 7), wMm: 20, hMm: 8,
        })),
    ],
});

/** A clinic with this template (null: none), the super admin on its print template tab, the designer on screen when there's a template. */
export const openDesigner = async (page: Page, data: Data, lang: Lang, layout: Layout | null) => {
    const clinic = await data.clinic();
    if (layout) await putTemplate(data, clinic, layout);
    const designer = designerOf(page, lang);
    await signInSuperAdmin(page, tabPath(clinic));
    if (layout) await designerShown(designer);
    return {clinic, designer, pt: designer.pt};
};

/** From the clinics' list to the designer, by the clinic's link and the tab. */
export const enterDesignerFromList = async (page: Page, designer: Designer, clinic: { id: number; name: string }) => {
    await page.getByRole("link", {name: clinic.name, exact: true}).click();
    await expect(page).toHaveURL(new RegExp(`/admin/clinics/${clinic.id}$`));
    await page.getByRole("tab", {name: designer.pt.tab, exact: true}).click();
    await designerShown(designer);
};

/**
 * The same, reached from the clinics' list, so the browser's history has a page of the app behind the designer: that list, since
 * the clinic's tabs `replace` the overview's entry (`CLINICS_LIST_URL` for its URL).
 */
export const openDesignerByTab = async (page: Page, data: Data, lang: Lang, layout: Layout) => {
    const clinic = await data.clinic();
    await putTemplate(data, clinic, layout);
    const designer = designerOf(page, lang);
    await signInSuperAdmin(page, `/admin?search=${encodeURIComponent(clinic.name)}`);
    await enterDesignerFromList(page, designer, clinic);
    return {clinic, designer, pt: designer.pt};
};

/** The URL of the page behind `openDesignerByTab`'s designer. */
export const CLINICS_LIST_URL = /\/admin\?search=/;

export const saveLayout = async (page: Page, designer: Designer) => {
    await designer.save.click();
    await expectToast(page, designer.pt.saved);
};

export const reopenDesigner = async (page: Page, designer: Designer) => {
    await page.reload();
    await settled(page);
    await designerShown(designer);
};

/** Nothing unsaved and no step in the history. */
export const expectUntouched = async (designer: Designer) => {
    await expect(designer.save, "nothing unsaved").toBeDisabled();
    await expect(designer.undo, "no undo step").toBeDisabled();
};
