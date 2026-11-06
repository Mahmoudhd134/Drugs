import {
    CASCADE_START_MM,
    CASCADE_STEP_MM,
    DEFAULT_FONT_SIZE_PT,
    DEFAULT_ITEM_ALIGN,
    DEFAULT_ITEM_SIZES,
    DEFAULT_TEXT_BOX,
    ITEM_ALIGNS,
    ITEM_ID_MAX_LENGTH,
    MAX_CALIBRATION_MM,
    MAX_CUSTOM_HEIGHT_MM,
    MAX_CUSTOM_WIDTH_MM,
    MAX_FONT_SIZE_PT,
    MAX_ITEMS,
    MIN_CUSTOM_HEIGHT_MM,
    MIN_CUSTOM_WIDTH_MM,
    MIN_FONT_SIZE_PT,
    MIN_ITEM_HEIGHT_MM,
    MIN_ITEM_WIDTH_MM,
    MIN_TEXT_HEIGHT_MM,
    NAME_MAX_LENGTH,
    PAGE_SIZES,
    SCHEMA_VERSION,
    STATIC_TEXT_MAX_LENGTH,
    TEMPLATE_FUNCTIONS,
    TEMPLATE_KINDS,
} from "./constants.ts";
import type {AddableItem, ItemAlign, LayoutError, PageSize, PrintLayout, TemplateCalibration, TemplateFunction, TemplateItem, TemplateItemKind, TemplatePage} from "./types.ts";

/*
 * The designer's pure rules (contract § 2.2), mirroring the server's validator and `PrescriptionLayoutRules`. StrykerJS
 * mutates this file (PURE_LOGIC).
 */

/**
 * One decimal, midpoint away from zero, as `Math.Round(value, 1, MidpointRounding.AwayFromZero)` on the server:
 * 12.34 → 12.3, 12.35 → 12.4, -12.35 → -12.4, 0.05 → 0.1. Doubles can't hold 12.35, so the scaled value drops its noise
 * before rounding.
 */
export const roundTenth = (value: number) =>
    Math.sign(value) * Math.round(Number((Math.abs(value) * 10).toPrecision(12))) / 10;

/** Whole tenths of a mm, for every comparison and sum (0.3 + 209.8 → 3 + 2098 = 2101 = 210.1 → 2101: TPL-210). */
export const toTenths = (value: number) => Math.round(roundTenth(value) * 10);

const AROUND_NUMBER = /^[\s‎‏؜]+|[\s‎‏؜]+$/g;
const NUMBER_TEXT = /^[-+\u2212]?(\d+([.,٫]\d*)?|[.,٫]\d+)$/;

/** An Arabic-Indic (٠–٩) or Persian (۰–۹) digit as its Latin one. */
const latinDigit = (digit: string) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
};

/**
 * What a typed number field holds: `12.5`, `12,5` and `١٢٫٥` are all 12.5, rounded by {@link roundTenth}; spaces around it
 * and the invisible marks U+200E, U+200F, U+061C are ignored; Arabic-Indic (٠–٩) and Persian (۰–۹) digits are read; a
 * leading `-` is kept (the rules then refuse it, it is never corrected silently). One leading `+` or `−` (U+2212, as the
 * helper line prints it) is a sign too, once the spaces and marks around it are gone: `+2` is 2, `−2` is -2, `+1` is 1 in every
 * field (step 4 design § 3, TPL-700). null: empty or anything else (`abc`, `1.2.3`, `1e3`, `٫`, `-`, `+`, `−`, `+-2`, `−−2`, `- 2`, `2+`, `2−`).
 */
export const parseMmInput = (text: string) => {
    const latin = text.replace(AROUND_NUMBER, "").replace(/[٠-٩۰-۹]/g, latinDigit);
    if (!NUMBER_TEXT.test(latin)) return null;
    return roundTenth(Number(latin.replace(/[,٫]/, ".").replace("\u2212", "-")));
};

/**
 * A number as its field shows it: Latin digits, a dot, at most one decimal (`12.5`, `148`), never an exponent: from 1e21
 * `String` writes `1e+21`, which {@link parseMmInput} refuses.
 */
export const formatMm = (value: number) => {
    const rounded = roundTenth(value);
    const text = String(rounded);
    return text.includes("e") ? rounded.toLocaleString("en-US", {useGrouping: false}) : text;
};

const roundIfNumber = (value: number) => (typeof value === "number" ? roundTenth(value) : value);

/** A correction's number: rounded, and -0 is exactly 0 (TPL-721); a null or missing one stays, for the rules. */
const roundCalibration = (value: number) => (typeof value === "number" ? roundTenth(value) + 0 : value);

const KINDS_WITH_ALIGN = new Set<string>(["manualInput", "function", "staticText"]);

/** How an item's value lines up: its alignment, or right when it holds none, as a template saved before the setting. */
export const alignOf = (item: TemplateItem): ItemAlign => ("align" in item && item.align) || DEFAULT_ITEM_ALIGN;

const normalizeItem = (item: TemplateItem): TemplateItem => {
    if (!item) return item;
    const rounded = {
        ...item,
        xMm: roundIfNumber(item.xMm),
        yMm: roundIfNumber(item.yMm),
        wMm: roundIfNumber(item.wMm),
        hMm: roundIfNumber(item.hMm),
        fontSizePt: roundIfNumber(item.fontSizePt),
    };
    if ("align" in rounded && !KINDS_WITH_ALIGN.has(rounded.kind)) delete rounded.align;
    return "name" in rounded && typeof rounded.name === "string" ? {...rounded, name: rounded.name.trim()} : rounded;
};

/**
 * What is validated, compared and sent (the server's `Normalize`): every number rounded, a name trimmed; a static text as
 * typed; an alignment on a manual input, a function or a static text only. The order of the items is kept. Takes what the API could hold: a missing page, list or number stays missing, but a
 * missing or null `calibration` is 0, 0 (step 4 design § 4).
 */
export const normalizeLayout = (layout: PrintLayout): PrintLayout => ({
    ...layout,
    page: layout.page && {
        ...layout.page,
        widthMm: roundIfNumber(layout.page.widthMm),
        heightMm: roundIfNumber(layout.page.heightMm),
    },
    items: layout.items && layout.items.map(normalizeItem),
    calibration: layout.calibration
        ? {xMm: roundCalibration(layout.calibration.xMm), yMm: roundCalibration(layout.calibration.yMm)}
        : {xMm: 0, yMm: 0},
});

const BLANK_TEXT = /^[\s\u0085\p{Cf}]*$/u;
const REFUSED_IN_NAME = /[\p{Cc}\p{Zl}\p{Zp}‪-‮⁦-⁩]/u;
const REFUSED_IN_TEXT = /(?![\n\r\t])[\p{Cc}\p{Zl}\p{Zp}‪-‮⁦-⁩]/u;
const ITEM_ID = new RegExp(`^[A-Za-z0-9_-]{1,${ITEM_ID_MAX_LENGTH}}$`);

/** Nothing but white space and invisible format characters (null too): the server's `IsBlank`. */
const isBlank = (text: string | null | undefined) => typeof text !== "string" || BLANK_TEXT.test(text);

const nameKey = (name: string) => name.trim().toLowerCase();

const isMissing = (value: number | null | undefined) => value === null || value === undefined;

/** `min <= value <= max`, in whole tenths. */
const inRange = (value: number, min: number, max: number) =>
    toTenths(value) >= toTenths(min) && toTenths(value) <= toTenths(max);

/** The box fits the sheet on one axis (the server's `Fits`); a negative or missing length counts as 0. */
const fits = (start: number, length: number | null | undefined, sheet: number) => {
    const startTenths = toTenths(start);
    const lengthTenths = Math.max(toTenths(length ?? 0), 0);
    const sheetTenths = toTenths(sheet);
    return startTenths >= 0 && lengthTenths <= sheetTenths && startTenths <= sheetTenths - lengthTenths;
};

/** Rules 3–5 of contract § 1.4. Returns whether the page passed them. */
const validatePage = (page: TemplatePage, errors: LayoutError[]) => {
    const fixed = PAGE_SIZES[page.size as keyof typeof PAGE_SIZES];
    if (!fixed && page.size !== "custom") {
        errors.push({field: "page.size", code: "templatePageInvalid"});
        return false;
    }
    const before = errors.length;
    if (isMissing(page.widthMm)) errors.push({field: "page.widthMm", code: "invalidRequest"});
    if (isMissing(page.heightMm)) errors.push({field: "page.heightMm", code: "invalidRequest"});
    const widthFits = fixed
        ? toTenths(page.widthMm) === toTenths(fixed.widthMm)
        : inRange(page.widthMm, MIN_CUSTOM_WIDTH_MM, MAX_CUSTOM_WIDTH_MM);
    const heightFits = fixed
        ? toTenths(page.heightMm) === toTenths(fixed.heightMm)
        : inRange(page.heightMm, MIN_CUSTOM_HEIGHT_MM, MAX_CUSTOM_HEIGHT_MM);
    if (!isMissing(page.widthMm) && !widthFits) errors.push({field: "page.widthMm", code: "templatePageInvalid"});
    if (!isMissing(page.heightMm) && !heightFits) errors.push({field: "page.heightMm", code: "templatePageInvalid"});
    return errors.length === before;
};

/** What an item may hold while being checked: any kind, any field missing. */
type ItemToCheck = {
    id?: string | null;
    kind?: string | null;
    function?: string | null;
    name?: string | null;
    text?: string | null;
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
    fontSizePt: number;
    align?: string | null;
};

/** Rule 8d, as the shared `ValidName(60)`: each part is checked on its own. */
const validateName = (name: string | null | undefined, field: string, errors: LayoutError[]) => {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (isBlank(name)) errors.push({field, code: "nameRequired"});
    else if (REFUSED_IN_NAME.test(trimmed)) errors.push({field, code: "nameInvalid"});
    if (trimmed.length > NAME_MAX_LENGTH) errors.push({field, code: "nameTooLong"});
};

/** Rules 8f–8h. */
const validateStaticText = (text: string | null | undefined, field: string, errors: LayoutError[]) => {
    if (isBlank(text)) errors.push({field, code: "templateStaticTextRequired"});
    if (typeof text !== "string") return;
    if (REFUSED_IN_TEXT.test(text)) errors.push({field, code: "invalidText"});
    if (text.length > STATIC_TEXT_MAX_LENGTH) errors.push({field, code: "templateStaticTextTooLong"});
};

/** Rules 8i and 8j. `pageOk`: the page passed rules 2–5, so "outside" can be checked. */
const validateBox = (item: ItemToCheck, prefix: string, page: TemplatePage, pageOk: boolean, errors: LayoutError[]) => {
    if (isMissing(item.xMm)) errors.push({field: `${prefix}.xMm`, code: "invalidRequest"});
    else if (pageOk && !fits(item.xMm, item.wMm, page.widthMm)) errors.push({field: `${prefix}.xMm`, code: "templateItemOutsidePage"});

    if (isMissing(item.yMm)) errors.push({field: `${prefix}.yMm`, code: "invalidRequest"});
    else if (pageOk && !fits(item.yMm, item.hMm, page.heightMm)) errors.push({field: `${prefix}.yMm`, code: "templateItemOutsidePage"});

    if (isMissing(item.wMm)) errors.push({field: `${prefix}.wMm`, code: "invalidRequest"});
    else if (toTenths(item.wMm) < toTenths(MIN_ITEM_WIDTH_MM)) errors.push({field: `${prefix}.wMm`, code: "templateItemSizeInvalid"});

    const minHeight = item.kind === "prescriptionText" ? MIN_TEXT_HEIGHT_MM : MIN_ITEM_HEIGHT_MM;
    if (isMissing(item.hMm)) errors.push({field: `${prefix}.hMm`, code: "invalidRequest"});
    else if (toTenths(item.hMm) < toTenths(minHeight)) errors.push({field: `${prefix}.hMm`, code: "templateItemSizeInvalid"});

    if (isMissing(item.fontSizePt)) errors.push({field: `${prefix}.fontSizePt`, code: "invalidRequest"});
    else if (!inRange(item.fontSizePt, MIN_FONT_SIZE_PT, MAX_FONT_SIZE_PT)) errors.push({field: `${prefix}.fontSizePt`, code: "templateFontSizeInvalid"});
};

/** Rules 9 and 10 (step 4 design § 4), in that order as rules 4 and 5: every missing number first, then every number out of range. */
const validateCalibration = ({xMm, yMm}: TemplateCalibration, errors: LayoutError[]) => {
    const numbers = [{field: "calibration.xMm", value: xMm}, {field: "calibration.yMm", value: yMm}];
    numbers.filter(({value}) => isMissing(value))
        .forEach(({field}) => errors.push({field, code: "invalidRequest"}));
    numbers.filter(({value}) => !isMissing(value) && !inRange(value, -MAX_CALIBRATION_MM, MAX_CALIBRATION_MM))
        .forEach(({field}) => errors.push({field, code: "templateCalibrationInvalid"}));
};

/**
 * Every broken rule of `normalizeLayout(layout)`, in the server's order with the server's fields and codes (contract § 1.4;
 * the shared cases: tests/fixtures/print-layout-cases.json). Empty: valid. Takes what the API could hold, so unknown kinds
 * and functions are checked at run time too.
 *
 * Step 4 (design § 4): rules 9 and 10 after every item's, whatever the item count, so also on the early exit over 50 items. Rule 9: X then Y not
 * null: `invalidRequest` on `calibration.xMm`, `calibration.yMm`. Rule 10: each number, in whole tenths, within `MAX_CALIBRATION_MM` either way:
 * `templateCalibrationInvalid` on the same field. All of rule 9 comes first: X out of range with Y null names Y first. `calibrationCutsItems` isn't
 * a rule: a box moved off the sheet saves.
 */
export const validateLayout = (layout: PrintLayout): LayoutError[] => {
    const {schemaVersion, page, items, calibration} = normalizeLayout(layout);
    const errors: LayoutError[] = [];

    if (schemaVersion !== SCHEMA_VERSION) errors.push({field: "schemaVersion", code: "templateLayoutInvalid"});

    let pageOk = false;
    if (page) pageOk = validatePage(page, errors);
    else errors.push({field: "page", code: "invalidRequest"});

    const list = (items ?? []) as (ItemToCheck | null)[];
    if (list.length > MAX_ITEMS) {
        errors.push({field: "items", code: "templateTooManyItems"});
        validateCalibration(calibration, errors);
        return errors;
    }
    if (list.filter(item => item?.kind === "prescriptionText").length !== 1) {
        errors.push({field: "items", code: "templateTextCount"});
    }

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    list.forEach((item, index) => {
        const prefix = `items[${index}]`;
        if (!item) {
            errors.push({field: prefix, code: "templateLayoutInvalid"});
            return;
        }

        const id = item.id ?? "";
        if (!ITEM_ID.test(id) || seenIds.has(id)) errors.push({field: `${prefix}.id`, code: "templateLayoutInvalid"});
        seenIds.add(id);

        if (!TEMPLATE_KINDS.includes(item.kind as TemplateItemKind)) {
            errors.push({field: `${prefix}.kind`, code: "templateLayoutInvalid"});
            return;
        }

        if (item.kind === "function" && !TEMPLATE_FUNCTIONS.includes(item.function as TemplateFunction)) {
            errors.push({field: `${prefix}.function`, code: "templateLayoutInvalid"});
        }
        if (item.kind === "manualInput" || item.kind === "function") {
            validateName(item.name, `${prefix}.name`, errors);
            if (!isBlank(item.name)) {
                const key = nameKey(item.name as string);
                if (seenNames.has(key)) errors.push({field: `${prefix}.name`, code: "templateItemNameTaken"});
                seenNames.add(key);
            }
        }
        if (item.kind === "staticText") validateStaticText(item.text, `${prefix}.text`, errors);
        validateBox(item, prefix, page, pageOk, errors);
        if (item.align !== null && item.align !== undefined && !ITEM_ALIGNS.includes(item.align as ItemAlign)) {
            errors.push({field: `${prefix}.align`, code: "templateLayoutInvalid"});
        }
    });
    validateCalibration(calibration, errors);
    return errors;
};

/**
 * True while any box, moved by the layout's X and Y, leaves the sheet on any side (step 4 design § 3, A6),
 * in whole tenths ({@link toTenths}), so a sum like 210.1 doesn't misfire. Exactly at the edge doesn't count: `x + X < 0`, `y + Y < 0`,
 * `x + X + w > page width` or `y + Y + h > page height`. The prescription text counts like any box. A warning only: Save and printing still work.
 * TPL-617.
 */
export const calibrationCutsItems = (layout: PrintLayout): boolean => {
    const {page, items, calibration} = normalizeLayout(layout);
    const moveX = toTenths(calibration.xMm);
    const moveY = toTenths(calibration.yMm);
    return items.some(item => {
        const left = toTenths(item.xMm) + moveX;
        const top = toTenths(item.yMm) + moveY;
        return left < 0
            || top < 0
            || left + toTenths(item.wMm) > toTenths(page.widthMm)
            || top + toTenths(item.hMm) > toTenths(page.heightMm);
    });
};

/**
 * Every manual input and function whose name another one shares (trimmed, ignoring case: `nameKey`), as
 * `{field: "items[i].name", code: "templateItemNameTaken"}`, in the layout's order (step 4 design § 6). Outside {@link validateLayout}, whose answer the
 * parity fixture fixes: that still names only the later item. The designer adds these to what it shows and to what selects the first problem. TPL-683, TPL-722.
 */
export const sharedNameErrors = ({items}: PrintLayout): LayoutError[] => {
    const keyOf = (item: TemplateItem) => (
        (item.kind === "manualInput" || item.kind === "function") && !isBlank(item.name) ? nameKey(item.name) : null
    );
    const counts = new Map<string, number>();
    items.map(keyOf).forEach(key => {
        if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return items.flatMap((item, index) => {
        const key = keyOf(item);
        return key !== null && counts.get(key)! > 1
            ? [{field: `items[${index}].name`, code: "templateItemNameTaken"}]
            : [];
    });
};

/** The item index a field names: `items[2].name` → 2; `page.widthMm`, `items` → null. */
export const itemIndexOfField = (field: string) => {
    const match = /^items\[(\d+)]/.exec(field);
    return match ? Number(match[1]) : null;
};

/** A new A5 sheet holding only the prescription text (`DEFAULT_TEXT_BOX`, font 11, id `i1`). */
export const newLayout = (): PrintLayout => ({
    schemaVersion: SCHEMA_VERSION,
    page: {size: "A5", ...PAGE_SIZES.A5},
    items: [{id: "i1", kind: "prescriptionText", ...DEFAULT_TEXT_BOX, fontSizePt: DEFAULT_FONT_SIZE_PT}],
    calibration: {xMm: 0, yMm: 0},
});

/** True while another item fits (fewer than `MAX_ITEMS`). */
export const canAddItem = (layout: PrintLayout) => layout.items.length < MAX_ITEMS;

/** The first `i<n>` no item has. */
const freeItemId = (items: TemplateItem[]) => {
    const taken = new Set(items.map(item => item.id));
    let n = 1;
    while (taken.has(`i${n}`)) n++;
    return `i${n}`;
};

/** `defaultName`, else `defaultName 2`, `defaultName 3`…: the first no manual input or function has (TPL-218). */
const distinctName = (items: TemplateItem[], defaultName: string) => {
    const taken = new Set(items.flatMap(item => ("name" in item ? [nameKey(item.name)] : [])));
    let name = defaultName;
    for (let n = 2; taken.has(nameKey(name)); n++) name = `${defaultName} ${n}`;
    return name;
};

/** Where the n-th item starts on one axis: a cascade, always inside the sheet (a 50 × 50 mm page too). */
const cascade = (n: number, sheet: number, length: number) =>
    (CASCADE_START_MM + CASCADE_STEP_MM * n) % (Math.floor(sheet - length) + 1);

/**
 * The layout with the panel's item added last, and that item; null at `MAX_ITEMS` (no 51st). The id is the first free
 * `i<n>`. Font `DEFAULT_FONT_SIZE_PT`, size `DEFAULT_ITEM_SIZES`, with n = the items already there:
 * `xMm = (CASCADE_START_MM + CASCADE_STEP_MM * n) % (floor(page.widthMm - wMm) + 1)`, and `yMm` likewise with the height,
 * so it is always inside (a 50 × 50 mm page too). Manual input and function: the name is `defaultName` (the kind's label
 * in the UI language), or `defaultName 2`, `defaultName 3`… the first not taken (trimmed, ignoring case). Static text:
 * empty text, no name.
 */
export const addItem = (layout: PrintLayout, addable: AddableItem, defaultName: string): { layout: PrintLayout; item: TemplateItem } | null => {
    if (!canAddItem(layout)) return null;
    const {page, items} = layout;
    const size = DEFAULT_ITEM_SIZES[addable.kind];
    const box = {
        id: freeItemId(items),
        xMm: cascade(items.length, page.widthMm, size.wMm),
        yMm: cascade(items.length, page.heightMm, size.hMm),
        ...size,
        fontSizePt: DEFAULT_FONT_SIZE_PT,
    };
    let item: TemplateItem;
    if (addable.kind === "staticText") item = {...box, kind: "staticText", text: ""};
    else if (addable.kind === "manualInput") item = {...box, kind: "manualInput", name: distinctName(items, defaultName)};
    else item = {...box, kind: "function", function: addable.function, name: distinctName(items, defaultName)};
    return {layout: {...layout, items: [...items, item]}, item};
};

/** The layout without the item; the prescription text is never removed (the layout comes back unchanged). */
export const removeItem = (layout: PrintLayout, id: string): PrintLayout => {
    const item = layout.items.find(i => i.id === id);
    if (item?.kind === "prescriptionText") return layout;
    return {...layout, items: layout.items.filter(i => i.id !== id)};
};

/** The layout with the item's fields changed, exactly as given (no moving, no correcting: TPL-224). */
export const updateItem = (layout: PrintLayout, id: string, changes: Partial<TemplateItem>): PrintLayout => ({
    ...layout,
    items: layout.items.map(item => (item.id === id ? {...item, ...changes} as TemplateItem : item)),
});

/** The measures of a size: A5 and A4 theirs, custom the current ones (`current` unchanged, only `size` differs). */
export const pageOfSize = (size: PageSize, current: TemplatePage): TemplatePage =>
    size === "custom" ? {...current, size} : {size, ...PAGE_SIZES[size]};

/** One axis of an item on a new sheet, in tenths: the length shrinks only as far as needed, then the start moves back in. */
const fitAxis = (start: number, length: number, sheet: number, minimum: number) => {
    const lengthTenths = toTenths(length);
    const sheetTenths = toTenths(sheet);
    const fitted = Math.max(Math.min(lengthTenths, sheetTenths), Math.min(lengthTenths, toTenths(minimum)));
    const moved = Math.max(Math.min(toTenths(start), sheetTenths - fitted), 0);
    return {start: moved / 10, length: fitted / 10};
};

/**
 * The layout on a new page (design § 3): items keep their mm. On each axis, length = `min(length, sheet)` unless that goes
 * below the item's minimum (a sheet is never smaller than a minimum, so only an item already below it keeps its length);
 * then start = clamped to `[0, sheet - length]`. Items already inside don't change (TPL-222, TPL-223). Works in tenths.
 */
export const applyPageSize = (layout: PrintLayout, page: TemplatePage): PrintLayout => ({
    ...layout,
    page,
    items: layout.items.map(item => {
        const across = fitAxis(item.xMm, item.wMm, page.widthMm, MIN_ITEM_WIDTH_MM);
        const minHeight = item.kind === "prescriptionText" ? MIN_TEXT_HEIGHT_MM : MIN_ITEM_HEIGHT_MM;
        const down = fitAxis(item.yMm, item.hMm, page.heightMm, minHeight);
        return {...item, xMm: across.start, wMm: across.length, yMm: down.start, hMm: down.length};
    }),
});

const PAGE_FIELDS = ["size", "widthMm", "heightMm"] as const;
const ITEM_FIELDS = ["id", "kind", "function", "name", "text", "xMm", "yMm", "wMm", "hMm", "fontSizePt"] as const;

const sameItem = (a: TemplateItem, b: TemplateItem) => {
    const left = a as ItemToCheck;
    const right = b as ItemToCheck;
    // Missing, null and right are one alignment: an old template opens clean, and back to right is clean again
    return ITEM_FIELDS.every(field => left[field] === right[field]) && alignOf(a) === alignOf(b);
};

/** Same normalized layout: the same page, the same items, fields and order (TPL-233), and the same calibration (step 4 design § 5). */
export const sameLayout = (a: PrintLayout, b: PrintLayout) => {
    const left = normalizeLayout(a);
    const right = normalizeLayout(b);
    return left.schemaVersion === right.schemaVersion
        && PAGE_FIELDS.every(field => left.page[field] === right.page[field])
        && left.items.length === right.items.length
        && left.items.every((item, index) => sameItem(item, right.items[index]))
        && left.calibration.xMm === right.calibration.xMm
        && left.calibration.yMm === right.calibration.yMm;
};
