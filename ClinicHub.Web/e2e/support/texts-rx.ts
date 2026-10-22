/**
 * The expected texts of the prescription journeys (RX), written out like support/texts.ts (never imported from the
 * locale files, so a changed message fails a test). Messages: the RX cases of docs/testing/test-catalog.md and
 * docs/features/prescription/business.md "الرسائل التي تظهر للمستخدم" (which quote ar.ts and en.ts); plain labels
 * (buttons, titles) as the locale files have them. A name inside a message sits in the bidi isolates U+2068/U+2069.
 * Dosing sentences are always Arabic (DOSE-040): see RX_SENTENCES.
 */
import type {Lang} from "./texts.ts";

const iso = (name: string) => `⁨${name}⁩`;

const ar = {
    // Page (RX-001)
    catalog: "إضافة إلى الروشتة",
    selected: "الأدوية المختارة",
    tabProtocols: "المجموعات",
    tabDrugs: "الأدوية",
    searchProtocols: "ابحث عن مجموعة بالاسم…",
    searchDrugs: "ابحث عن دواء بالاسم…",
    emptyTitle: "لم يتم اختيار شيء بعد",
    /** The drug picker's mark on a drug in the prescription (RX-005) */
    added: "مُضاف",
    // Adding (RX-007)
    alreadyAdded: (name: string) => `«${iso(name)}» موجود بالفعل في القائمة`,
    // Group toast lines (RX-017, RX-024, RX-027, RX-029, RX-041, RX-042, RX-049)
    protocolAdded: (name: string, n: number) => `تمت الإضافة من «${iso(name)}»: ${n}`,
    protocolReplaced: (n: number) => `تم الاستبدال بجرعة المجموعة: ${n}`,
    protocolKept: (n: number) => `تم الإبقاء على الجرعة الحالية: ${n}`,
    protocolSkipped: (n: number) => `موجود مسبقًا في القائمة: ${n}`,
    protocolDuplicated: (n: number) => `مكرر في المجموعة ولم يُضف: ${n}`,
    // Eye question (RX-019)
    chooseEyeTitle: "أي عين؟",
    chooseEyeMessage: (protocol: string) => `بعض أدوية «${iso(protocol)}» تُعطى للعين التي تختارها الآن.`,
    eyeRight: "اليمنى",
    eyeLeft: "اليسرى",
    eyeBoth: "العينين",
    cancel: "إلغاء",
    // Conflict (RX-038, RX-044)
    conflictTitle: "موجود بالفعل في الروشتة",
    conflictMessage: (name: string) => `«${iso(name)}» موجود بالفعل في القائمة بجرعة مختلفة.`,
    conflictCurrent: "الحالي",
    conflictIncoming: "من المجموعة",
    keepCurrent: "الإبقاء على الحالي",
    useProtocol: "استخدام جرعة المجموعة",
    applyToRemaining: (n: number) => `تطبيق على باقي التعارضات: ${n}`,
    // Two dosings for the same eye (RX-030)
    protocolClashTitle: "جرعتان لنفس العين",
    protocolClashMessage: (name: string) => `«${iso(name)}» موجود في المجموعة مرتين للعين التي اخترتها، بجرعتين مختلفتين. أي جرعة تُضاف؟`,
    protocolClashFirst: "الجرعة الأولى في المجموعة",
    protocolClashSecond: "الجرعة الثانية في المجموعة",
    useFirst: "استخدام الأولى",
    useSecond: "استخدام الثانية",
    // Lines (RX-053, RX-058, RX-061, RX-064)
    editLine: "تعديل الجرعة",
    lineNote: "ملاحظة لهذه الروشتة",
    addOtherEye: "إضافة للعين الأخرى",
    remove: "إزالة",
    eyeTaken: (name: string) => `«${iso(name)}» موجود بالفعل في القائمة لنفس العين`,
    amount: "الجرعة",
    timesPerDay: "العدد",
    durationValue: "المدة",
    preview: "نص الروشتة",
    save: "حفظ",
    // Copy (RX-071, RX-075, RX-078)
    quickCopy: "نسخ",
    editAndCopy: "تعديل ونسخ",
    copied: "تم النسخ",
    editorTitle: "تعديل قبل النسخ",
    editorHint: "التعديلات هنا للنسخ فقط ولا يتم حفظها.",
    close: "إغلاق",
    // Clear (RX-083)
    clearAll: "مسح الكل",
    cleared: "تم مسح القائمة",
    undo: "تراجع",
};

export type RxTexts = typeof ar;

const en: RxTexts = {
    catalog: "Add to prescription",
    selected: "Selected drugs",
    tabProtocols: "Groups",
    tabDrugs: "Drugs",
    searchProtocols: "Search groups by name…",
    searchDrugs: "Search drugs by name…",
    emptyTitle: "Nothing selected yet",
    added: "Added",
    alreadyAdded: name => `“${iso(name)}” is already in the list`,
    protocolAdded: (name, n) => `Added from “${iso(name)}”: ${n}`,
    protocolReplaced: n => `Replaced with the group's dosing: ${n}`,
    protocolKept: n => `Kept the current dosing: ${n}`,
    protocolSkipped: n => `Already in the list: ${n}`,
    protocolDuplicated: n => `Duplicated in the group, not added: ${n}`,
    chooseEyeTitle: "Which eye?",
    chooseEyeMessage: protocol => `Some drugs in “${iso(protocol)}” are for the eye you choose now.`,
    eyeRight: "Right",
    eyeLeft: "Left",
    eyeBoth: "Both",
    cancel: "Cancel",
    conflictTitle: "Already in the prescription",
    conflictMessage: name => `“${iso(name)}” is already in the list with a different dosing.`,
    conflictCurrent: "Current",
    conflictIncoming: "From the group",
    keepCurrent: "Keep current",
    useProtocol: "Use the group's",
    applyToRemaining: n => `Apply to the remaining conflicts: ${n}`,
    protocolClashTitle: "Two dosings for the same eye",
    protocolClashMessage: name => `“${iso(name)}” is in the group twice for the eye you chose, with different dosings. Which one should be added?`,
    protocolClashFirst: "First in the group",
    protocolClashSecond: "Second in the group",
    useFirst: "Use the first",
    useSecond: "Use the second",
    editLine: "Edit dosing",
    lineNote: "Note for this prescription",
    addOtherEye: "Add for the other eye",
    remove: "Remove",
    eyeTaken: name => `“${iso(name)}” is already in the list for that eye`,
    amount: "Dose",
    timesPerDay: "Times",
    durationValue: "Duration",
    preview: "Prescription text",
    save: "Save",
    quickCopy: "Copy",
    editAndCopy: "Edit & copy",
    copied: "Copied to clipboard",
    editorTitle: "Edit before copying",
    editorHint: "Changes here are only used for copying and are not saved.",
    close: "Close",
    clearAll: "Clear all",
    cleared: "List cleared",
    undo: "Undo",
};

export const RX_TEXTS: Record<Lang, RxTexts> = {ar, en};

/**
 * Dosings (API shape, docs/features/dosing/tech.md "Data model") and their Arabic sentences, the exact output of
 * `dosingToText` as the DOSE cases give it (catalog "Sentence" sections). Parts in the order dose → eye → frequency →
 * duration, single spaces (DOSE-034).
 */
export const RX_DOSINGS = {
    /** DOSE-034 */
    twoDropsLeft6Daily2Weeks: {
        dosing: {doseAmount: 2, doseUnit: "drop", eye: "left", frequency: "daily", frequencyValue: 6, durationValue: 2, durationUnit: "weeks"},
        sentence: "نقطتين في العين اليسرى 6 مرات يوميًا لمدة أسبوعين",
    },
    /** DOSE-035 */
    tabletEvery8Hours5Days: {
        dosing: {doseAmount: 1, doseUnit: "tablet", frequency: "everyHours", frequencyValue: 8, durationValue: 5, durationUnit: "days"},
        sentence: "قرص واحد كل 8 ساعات لمدة 5 أيام",
    },
    /** DOSE-036 */
    ointmentBothBedtimeNextVisit: {
        dosing: {doseUnit: "application", eye: "both", frequency: "bedtime", durationUnit: "untilNextVisit"},
        sentence: "طبقة رقيقة في العينين قبل النوم حتى الزيارة القادمة",
    },
    /** DOSE-038 */
    dropRightAfterMealsContinuous: {
        dosing: {doseAmount: 1, doseUnit: "drop", eye: "right", frequency: "custom", frequencyText: "بعد الأكل", durationUnit: "continuous"},
        sentence: "نقطة واحدة في العين اليمنى بعد الأكل بصفة مستمرة",
    },
} as const;

/** Sentence parts (DOSE-001, DOSE-017, DOSE-019, DOSE-028), to build the sentence of a dosing made in a test. */
export const RX_PARTS = {
    oneDrop: "نقطة واحدة",
    twoDrops: "نقطتين",
    eye: {right: "في العين اليمنى", left: "في العين اليسرى", both: "في العينين"} as Record<string, string>,
    /** DOSE-019: 1 → «مرة واحدة يوميًا», 2 → «مرتين يوميًا», 3–10 → «N مرات يوميًا» */
    daily: (n: number) => n === 1 ? "مرة واحدة يوميًا" : n === 2 ? "مرتين يوميًا" : `${n} مرات يوميًا`,
    /** DOSE-028: 1 → «لمدة أسبوع», 2 → «لمدة أسبوعين», 3–10 → «لمدة N أسابيع» */
    weeks: (n: number) => n === 1 ? "لمدة أسبوع" : n === 2 ? "لمدة أسبوعين" : `لمدة ${n} أسابيع`,
};

/** «نقطة واحدة [eye] N مرات يوميًا لمدة W أسبوع…» for a dosing built by `dropDaily` (support/rx.ts). */
export const dropDailySentence = (times: number, weeks: number, eye?: "right" | "left" | "both", drops: 1 | 2 = 1) =>
    [drops === 1 ? RX_PARTS.oneDrop : RX_PARTS.twoDrops, eye ? RX_PARTS.eye[eye] : null, RX_PARTS.daily(times), RX_PARTS.weeks(weeks)]
        .filter(Boolean).join(" ");
