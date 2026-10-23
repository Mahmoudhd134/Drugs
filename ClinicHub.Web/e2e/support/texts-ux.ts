import type {Lang} from "./texts.ts";

/**
 * The expected UI texts of the I18N and UX specs (e2e stage 2, track e2e-ux), written out for both languages (never
 * imported from the locale files, so a changed label fails a test). Messages: the business docs and the test catalog
 * (docs/testing/test-catalog.md, which quotes `ar.ts` / `en.ts`); plain labels as the locale files have them. A name
 * inside a message sits in the bidi isolates U+2068/U+2069 (catalog "How to read it").
 */
/** Counts as the UI shows them: grouped Latin digits (design M1.7 D9 "Numbers", I18N-014). */
const g = (n: number) => new Intl.NumberFormat("en-US").format(n);
const iso = (name: string) => `⁨${name}⁩`;

const ar = {
    // App bar
    language: "اللغة",
    // Prescription page
    rxTitle: "الروشتة",
    rxSelected: "الأدوية المختارة",
    quickCopy: "نسخ",
    editAndCopy: "تعديل ونسخ",
    clearAll: "مسح الكل",
    editorTitle: "تعديل قبل النسخ",
    editLine: "تعديل الجرعة",
    lineNote: "ملاحظة لهذه الروشتة",
    addOtherEye: "إضافة للعين الأخرى",
    remove: "إزالة",
    dragToReorder: "اسحب لتغيير الترتيب",
    chooseEyeTitle: "أي عين؟",
    eyeRight: "اليمنى",
    eyeLeft: "اليسرى",
    eyeBoth: "العينين",
    conflictTitle: "موجود بالفعل في الروشتة",
    conflictCurrent: "الحالي",
    conflictIncoming: "من البروتوكول",
    keepCurrent: "الإبقاء على الحالي",
    useProtocol: "استخدام جرعة البروتوكول",
    copied: "تم النسخ",
    alreadyAdded: (name: string) => `«${iso(name)}» موجود بالفعل في القائمة`,
    protocolAdded: (name: string, count: number) => `تمت الإضافة من «${iso(name)}»: ${count}`,
    results: (count: number) => `النتائج: ${g(count)}`,
    // Drugs
    drugsSubtitle: (count: number) => `إجمالي الأدوية: ${g(count)}`,
    displayedRows: (from: number, to: number, count: number) => `${g(from)}–${g(to)} من ${g(count)}`,
    drugDescription: "الوصف",
    deleteDrugTitle: "حذف الدواء؟",
    deleteDrugMessage: (name: string) => `سيتم حذف «${iso(name)}» وإزالته من كل البروتوكولات. لا يمكن التراجع عن ذلك.`,
    drugDeleted: "تم حذف الدواء",
    // Dosing fields
    doseUnit: "الوحدة",
    frequency: "عدد المرات",
    customFrequency: "نص عدد المرات",
    frequencyCustom: "نص مخصص",
    taperLabel: "تقليل تدريجي",
    taperInfo: "تقليل الجرعة على مراحل، مثلًا 4 مرات يوميًا لمدة أسبوع، ثم 3 مرات يوميًا لمدة أسبوع، وهكذا.",
    taperStep: (n: number) => `المرحلة ${n}`,
    dose: "الجرعة",
    taperTotalWeeks10: "المدة الإجمالية: 10 أسابيع",
    // Protocols
    protocolsSubtitle: (count: number) => `إجمالي البروتوكولات: ${count}`,
    protocolDrugCount: (count: number) => `الأدوية: ${count}`,
    deleteProtocolTitle: "حذف البروتوكول؟",
    protocolDeleted: "تم حذف البروتوكول",
    discardTitle: "تجاهل التغييرات؟",
    discard: "تجاهل",
    customDosingChip: "جرعة خاصة بالبروتوكول",
    askEyeChip: "العين تُحدد عند إضافة البروتوكول",
    // Load errors
    pageFailed: "تعذّر تحميل هذه الصفحة.",
};

type UxTexts = typeof ar;

const en: UxTexts = {
    language: "Language",
    rxTitle: "Prescription",
    rxSelected: "Selected drugs",
    quickCopy: "Copy",
    editAndCopy: "Edit & copy",
    clearAll: "Clear all",
    editorTitle: "Edit before copying",
    editLine: "Edit dosing",
    lineNote: "Note for this prescription",
    addOtherEye: "Add for the other eye",
    remove: "Remove",
    dragToReorder: "Drag to reorder",
    chooseEyeTitle: "Which eye?",
    eyeRight: "Right",
    eyeLeft: "Left",
    eyeBoth: "Both",
    conflictTitle: "Already in the prescription",
    conflictCurrent: "Current",
    conflictIncoming: "From the protocol",
    keepCurrent: "Keep current",
    useProtocol: "Use the protocol's",
    copied: "Copied to clipboard",
    alreadyAdded: name => `“${iso(name)}” is already in the list`,
    protocolAdded: (name, count) => `Added from “${iso(name)}”: ${count}`,
    results: count => `Results: ${g(count)}`,
    drugsSubtitle: count => `Total drugs: ${g(count)}`,
    displayedRows: (from, to, count) => `${g(from)}–${g(to)} of ${g(count)}`,
    drugDescription: "Description",
    deleteDrugTitle: "Delete drug?",
    deleteDrugMessage: name => `“${iso(name)}” will be deleted and removed from every protocol. This can't be undone.`,
    drugDeleted: "Drug deleted",
    doseUnit: "Unit",
    frequency: "Frequency",
    customFrequency: "Frequency text",
    frequencyCustom: "Custom",
    taperLabel: "Tapering schedule",
    taperInfo: "Reduce the dose step by step, e.g. 4 times a day for a week, then 3 times a day for a week, and so on.",
    taperStep: n => `Step ${n}`,
    dose: "Dose",
    taperTotalWeeks10: "Total: 10 weeks",
    protocolsSubtitle: count => `Total protocols: ${count}`,
    protocolDrugCount: count => `Drugs: ${count}`,
    deleteProtocolTitle: "Delete protocol?",
    protocolDeleted: "Protocol deleted",
    discardTitle: "Discard changes?",
    discard: "Discard",
    customDosingChip: "Protocol dosing",
    askEyeChip: "Eye is chosen when the protocol is added",
    pageFailed: "Couldn't load this page.",
};

export const UX_TEXTS: Record<Lang, UxTexts> = {ar, en};
export type {UxTexts};

/** The language menu's entries: each language's own name, the same in both UIs (`i18n/languages.ts` labels). */
export const LANGUAGE_NAMES: Record<Lang, string> = {ar: "العربية", en: "English"};

/**
 * Dosings and their Arabic sentences (the same in both UI languages: dosing business § القواعد; the catalog's exact
 * outputs of `dosingToText`).
 */
export const DOSINGS = {
    /** DOSE-034 */
    twoDropsLeft: {
        dosing: {doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6, durationValue: 2, durationUnit: "weeks"},
        text: "نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين",
    },
    /** GRP-068: a drug default… */
    oneDropFour: {
        dosing: {doseAmount: 1, doseUnit: "drop", frequency: "daily", frequencyValue: 4, durationValue: 2, durationUnit: "weeks"},
        text: "نقطة واحدة 4 مرات يوميًا لمدة أسبوعين",
    },
    /** …and a protocol override of the times only (GRP-068): the merged sentence */
    sixTimesOverride: {
        dosing: {frequency: "daily", frequencyValue: 6},
        text: "نقطة واحدة 6 مرات يوميًا لمدة أسبوعين",
    },
    /** DOSE-037: only an eye (right) */
    rightEyeOnly: {dosing: {eye: "right"}, text: "في العين اليمنى"},
} as const;

/** A 10-step taper (1 week each, daily 10 → 1) with 1 drop: total 10 weeks (TAPER-002, TAPER-047's whole weeks). */
export const TEN_STEP_TAPER = {
    doseAmount: 1,
    doseUnit: "drop",
    taperSteps: Array.from({length: 10}, (_, i) => ({
        doseAmount: null, frequency: "daily", frequencyValue: 10 - i, durationValue: 1, durationUnit: "weeks",
    })),
};
