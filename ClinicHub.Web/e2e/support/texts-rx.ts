/**
 * The expected texts of the prescription journeys (RX), written out like support/texts.ts (never imported from the
 * locale files, so a changed message fails a test). Messages: the RX cases of docs/testing/test-catalog.md and
 * docs/features/prescription/business.md "الرسائل التي تظهر للمستخدم" (which quote ar.ts and en.ts); plain labels
 * (buttons, titles) as the locale files have them. A name inside a message sits in the bidi isolates U+2068/U+2069.
 * Dosing sentences are always Arabic (DOSE-040): see RX_SENTENCES.
 */
import type {Lang} from "./texts.ts";

const iso = (name: string) => `⁨${name}⁩`;
/** Grouped Latin digits, as every count of the UI shows them (`{{count, count}}`, M1.7b D6): 23414 → "23,414". */
const group = (n: number) => new Intl.NumberFormat("en-US").format(n);

/**
 * The drug tree (`DrugTree`, docs/design/m1.7c-contract.md § 3.1 and § 3.3; locale keys `drugTree.*`, `drugs.source.*`,
 * `drugs.chip.*`, `drugs.noResults`, `drugs.noOwnDrugs`, `drugs.noSubCategory`, `common.*`), in the prescription's
 * «الأدوية» tab and in the protocol editor.
 */
const treeAr = {
    lang: "ar" as Lang,
    /** `drugTree.label`: the tree's accessible name */
    label: "كتالوج الأدوية",
    /** `drugTree.searchPlaceholder` (contract decision C1) */
    searchPlaceholder: "ابحث بالاسم أو المادة الفعالة أو التصنيف…",
    /** `drugTree.nodeLabel`: a category's or subcategory's accessible name («العيون، 541», C8) */
    node: (name: string, count: number) => `${name}، ${group(count)}`,
    /** The separator between a node's name and its count in `node` */
    nodeSeparator: "، ",
    /** `drugTree.open` / `drugTree.close`: a chevron's accessible name and tooltip (UX-042) */
    open: (name: string) => `فتح «${iso(name)}»`,
    close: (name: string) => `إغلاق «${iso(name)}»`,
    /** `common.results`: the total above the tree */
    results: (n: number) => `النتائج: ${group(n)}`,
    resultsPrefix: "النتائج: ",
    noResults: "لا توجد أدوية مطابقة للبحث.",
    noOwnDrugs: "لا توجد أدوية خاصة بالعيادة بعد.",
    noSubCategory: "بدون تصنيف فرعي",
    /** `drugs.source.*`: the source toggle */
    sourceLabel: "الأدوية المعروضة",
    sourceAll: "الكل",
    sourceShared: "المشتركة",
    sourceOwn: "أدوية العيادة",
    /** `drugs.chip.*`: a drug row's chip */
    chipShared: "مشترك",
    chipOwn: "خاص بالعيادة",
    added: "مُضاف",
    loadMore: "تحميل المزيد",
    loading: "جارٍ التحميل…",
    loadFailed: "تعذّر تحميل البيانات.",
    retry: "إعادة المحاولة",
};

export type TreeTexts = typeof treeAr;

const treeEn: TreeTexts = {
    lang: "en",
    label: "Drug catalog",
    searchPlaceholder: "Search by name, active ingredient or category…",
    node: (name, count) => `${name}, ${group(count)}`,
    nodeSeparator: ", ",
    open: name => `Open “${iso(name)}”`,
    close: name => `Close “${iso(name)}”`,
    results: n => `Results: ${group(n)}`,
    resultsPrefix: "Results: ",
    noResults: "No drugs match your search.",
    noOwnDrugs: "This clinic has no drugs of its own yet.",
    noSubCategory: "No subcategory",
    sourceLabel: "Drugs to show",
    sourceAll: "All",
    sourceShared: "Shared",
    sourceOwn: "Clinic's own",
    chipShared: "Shared",
    chipOwn: "Clinic",
    added: "Added",
    loadMore: "Load more",
    loading: "Loading…",
    loadFailed: "Couldn't load data.",
    retry: "Retry",
};

export const TREE_TEXTS: Record<Lang, TreeTexts> = {ar: treeAr, en: treeEn};

const ar = {
    // Page (RX-001)
    catalog: "إضافة إلى الروشتة",
    selected: "الأدوية المختارة",
    tabProtocols: "البروتوكولات",
    tabDrugs: "الأدوية",
    searchProtocols: "ابحث عن بروتوكول بالاسم…",
    /** The «الأدوية» tab's search: the drug tree's (M1.7c, contract decision C1) */
    searchDrugs: treeAr.searchPlaceholder,
    emptyTitle: "لم يتم اختيار شيء بعد",
    /** The drug tree's mark on a drug in the prescription (RX-005) */
    added: "مُضاف",
    /** The drug tree of the «الأدوية» tab */
    tree: treeAr,
    // Adding (RX-007)
    alreadyAdded: (name: string) => `«${iso(name)}» موجود بالفعل في القائمة`,
    // Protocol toast lines (RX-017, RX-024, RX-027, RX-029, RX-041, RX-042, RX-049)
    protocolAdded: (name: string, n: number) => `تمت الإضافة من «${iso(name)}»: ${n}`,
    protocolReplaced: (n: number) => `تم الاستبدال بجرعة البروتوكول: ${n}`,
    protocolKept: (n: number) => `تم الإبقاء على الجرعة الحالية: ${n}`,
    protocolSkipped: (n: number) => `موجود مسبقًا في القائمة: ${n}`,
    protocolDuplicated: (n: number) => `مكرر في البروتوكول ولم يُضف: ${n}`,
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
    conflictIncoming: "من البروتوكول",
    keepCurrent: "الإبقاء على الحالي",
    useProtocol: "استخدام جرعة البروتوكول",
    applyToRemaining: (n: number) => `تطبيق على باقي التعارضات: ${n}`,
    // Two dosings for the same eye (RX-030)
    protocolClashTitle: "جرعتان لنفس العين",
    protocolClashMessage: (name: string) => `«${iso(name)}» موجود في البروتوكول مرتين للعين التي اخترتها، بجرعتين مختلفتين. أي جرعة تُضاف؟`,
    protocolClashFirst: "الجرعة الأولى في البروتوكول",
    protocolClashSecond: "الجرعة الثانية في البروتوكول",
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
    tabProtocols: "Protocols",
    tabDrugs: "Drugs",
    searchProtocols: "Search protocols by name…",
    searchDrugs: treeEn.searchPlaceholder,
    emptyTitle: "Nothing selected yet",
    added: "Added",
    tree: treeEn,
    alreadyAdded: name => `“${iso(name)}” is already in the list`,
    protocolAdded: (name, n) => `Added from “${iso(name)}”: ${n}`,
    protocolReplaced: n => `Replaced with the protocol's dosing: ${n}`,
    protocolKept: n => `Kept the current dosing: ${n}`,
    protocolSkipped: n => `Already in the list: ${n}`,
    protocolDuplicated: n => `Duplicated in the protocol, not added: ${n}`,
    chooseEyeTitle: "Which eye?",
    chooseEyeMessage: protocol => `Some drugs in “${iso(protocol)}” are for the eye you choose now.`,
    eyeRight: "Right",
    eyeLeft: "Left",
    eyeBoth: "Both",
    cancel: "Cancel",
    conflictTitle: "Already in the prescription",
    conflictMessage: name => `“${iso(name)}” is already in the list with a different dosing.`,
    conflictCurrent: "Current",
    conflictIncoming: "From the protocol",
    keepCurrent: "Keep current",
    useProtocol: "Use the protocol's",
    applyToRemaining: n => `Apply to the remaining conflicts: ${n}`,
    protocolClashTitle: "Two dosings for the same eye",
    protocolClashMessage: name => `“${iso(name)}” is in the protocol twice for the eye you chose, with different dosings. Which one should be added?`,
    protocolClashFirst: "First in the protocol",
    protocolClashSecond: "Second in the protocol",
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
