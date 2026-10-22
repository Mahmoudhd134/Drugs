import type {Lang} from "./texts.ts";

/**
 * The expected texts of the catalog journeys (drugs, protocols, dosing, tapering), written out like `texts.ts` (never
 * imported from the locale files, so a changed message fails a test). Sources: the messages quoted by the business
 * docs and the test catalog (docs/features/{drugs,protocols,dosing,tapering}/business.md, docs/testing/test-catalog.md
 * DRUG/GRP/DOSE/TAPER), which quote `ar.ts` / `en.ts`; plain labels (fields, buttons) as the locale files have them.
 * A name inside a message sits in the bidi isolates U+2068/U+2069 (catalog "How to read it").
 */
/** Counts as the UI shows them: grouped Latin digits (design M1.7 D9 "Numbers", I18N-014). */
const g = (n: number) => new Intl.NumberFormat("en-US").format(n);
const iso = (name: string) => `⁨${name}⁩`;

const ar = {
    // Drugs (docs/features/drugs/business.md "الرسائل")
    drugsNoResults: "لا توجد أدوية مطابقة للبحث.",
    drugDeleted: "تم حذف الدواء",
    drugDeleteTitle: "حذف الدواء؟",
    drugDeleteMessage: (name: string) => `سيتم حذف «${iso(name)}» وإزالته من كل البروتوكولات. لا يمكن التراجع عن ذلك.`,
    /** The protocols using a drug, joined with the Arabic comma «، » in both languages (drugs tech, Q5) */
    drugUsedInProtocols: (names: string[]) => `يُستخدم في هذه البروتوكولات: ${iso(names.join("، "))}`,
    drugDescription: "الوصف",
    displayedRows: (from: number, to: number, count: number) => `${g(from)}–${g(to)} من ${g(count)}`,
    firstPage: "الذهاب إلى الصفحة الأولى",
    // Dosing form (docs/features/dosing/business.md "الحقول")
    dose: "الجرعة",
    unit: "الوحدة",
    frequency: "عدد المرات",
    timesPerDay: "العدد",
    period: "الفترة",
    duration: "المدة",
    units: {drop: "نقطة", tablet: "قرص"},
    frequencies: {daily: "مرات في اليوم"},
    durations: {days: "أيام", weeks: "أسابيع", untilNextVisit: "حتى الزيارة القادمة"},
    eyes: {right: "اليمنى", left: "اليسرى", both: "العينين", none: "بدون عين"},
    taper: "تقليل تدريجي",
    taperStep: (n: number) => `المرحلة ${n}`,
    drugDefault: "افتراضي الدواء",
    // Protocols (docs/features/protocols/business.md "الرسائل")
    protocolDeleted: "تم حذف البروتوكول",
    protocolDeleteTitle: "حذف البروتوكول؟",
    protocolDeleteMessage: (name: string) => `سيتم حذف «${iso(name)}». الأدوية نفسها لن تُحذف.`,
    protocolsNoResults: "لا توجد بروتوكولات مطابقة للبحث.",
    protocolsEmptyTitle: "لا توجد بروتوكولات بعد",
    protocolsPickerEmpty: "لا توجد بروتوكولات في هذه العيادة بعد.",
    drugCount: (n: number) => `الأدوية: ${n}`,
    moreDrugs: (n: number) => `+${n} أخرى`,
    drugsRequired: "أضف دواءً واحدًا على الأقل.",
    drugNotFound: "أحد الأدوية لم يعد موجودًا.",
    nameRequired: "الاسم مطلوب.",
    discardTitle: "تجاهل التغييرات؟",
    discardMessage: "ستفقد التغييرات غير المحفوظة على هذا البروتوكول.",
    discard: "تجاهل",
    eyeClash: "نفس الدواء والعين في سطر آخر",
    eyeClashSave: "يوجد دواء مكرر في البروتوكول لنفس العين (مُعلَّم بالأسفل). احذف أحد السطرين أو غيّر العين، ثم احفظ.",
    protocolDosing: "جرعة خاصة بالبروتوكول",
    itemDosing: "الجرعة في هذا البروتوكول",
    editLine: "تعديل الجرعة",
    addOtherEye: "إضافة للعين الأخرى",
    removeLine: "إزالة",
    dragToReorder: "اسحب لتغيير الترتيب",
    added: "مُضاف",
    noDrugsInProtocol: "لا توجد أدوية في هذا البروتوكول",
    addDrugs: "إضافة أدوية",
    pageN: (n: number) => `الصفحة ${n}`,
    goToPageN: (n: number) => `الذهاب إلى الصفحة ${n}`,
};

export type CatalogTexts = typeof ar;

const en: CatalogTexts = {
    drugsNoResults: "No drugs match your search.",
    drugDeleted: "Drug deleted",
    drugDeleteTitle: "Delete drug?",
    drugDeleteMessage: name => `“${iso(name)}” will be deleted and removed from every protocol. This can't be undone.`,
    drugUsedInProtocols: names => `It is used in these protocols: ${iso(names.join("، "))}`,
    drugDescription: "Description",
    displayedRows: (from, to, count) => `${g(from)}–${g(to)} of ${g(count)}`,
    firstPage: "Go to first page",
    dose: "Dose",
    unit: "Unit",
    frequency: "Frequency",
    timesPerDay: "Times",
    period: "Period",
    duration: "Duration",
    units: {drop: "Drop", tablet: "Tablet"},
    frequencies: {daily: "Times a day"},
    durations: {days: "Days", weeks: "Weeks", untilNextVisit: "Until next visit"},
    eyes: {right: "Right", left: "Left", both: "Both", none: "No eye"},
    taper: "Tapering schedule",
    taperStep: n => `Step ${n}`,
    drugDefault: "Drug default",
    protocolDeleted: "Protocol deleted",
    protocolDeleteTitle: "Delete protocol?",
    protocolDeleteMessage: name => `“${iso(name)}” will be deleted. The drugs themselves are kept.`,
    protocolsNoResults: "No protocols match your search.",
    protocolsEmptyTitle: "No protocols yet",
    protocolsPickerEmpty: "This clinic has no protocols yet.",
    drugCount: n => `Drugs: ${n}`,
    moreDrugs: n => `+${n} more`,
    drugsRequired: "Add at least one drug.",
    drugNotFound: "One of the drugs no longer exists.",
    nameRequired: "Name is required.",
    discardTitle: "Discard changes?",
    discardMessage: "Your unsaved changes to this protocol will be lost.",
    discard: "Discard",
    eyeClash: "Same drug and eye as another line",
    eyeClashSave: "A drug is in the protocol twice for the same eye (marked below). Remove a line or change its eye, then save.",
    protocolDosing: "Protocol dosing",
    itemDosing: "Dosing in this protocol",
    editLine: "Edit dosing",
    addOtherEye: "Add for the other eye",
    removeLine: "Remove",
    dragToReorder: "Drag to reorder",
    added: "Added",
    noDrugsInProtocol: "No drugs in this protocol",
    addDrugs: "Add drugs",
    pageN: n => `Page ${n}`,
    goToPageN: n => `Go to page ${n}`,
};

export const CATALOG_TEXTS: Record<Lang, CatalogTexts> = {ar, en};

/**
 * Dosing sentences: the exact output of `dosingToText` (docs/features/dosing/business.md, the catalog's "Dosing
 * sentences" note), Arabic in both UI languages (business rule «لغة الروشتة عربية دائمًا»).
 */
export const SENTENCES = {
    /** drop 1, right eye, 4 times a day, 7 days */
    dropRight4x7d: "نقطة واحدة في العين اليمنى 4 مرات يوميًا لمدة 7 أيام",
    /** drop 1, 4 times a day, 7 days */
    drop4x7d: "نقطة واحدة 4 مرات يوميًا لمدة 7 أيام",
    /** the same with the protocol's 6 times a day */
    drop6x7d: "نقطة واحدة 6 مرات يوميًا لمدة 7 أيام",
    /** the drug's default after its duration became 14 days */
    drop4x14d: "نقطة واحدة 4 مرات يوميًا لمدة 14 يومًا",
    /** the protocol's frequency with the drug's new duration */
    drop6x14d: "نقطة واحدة 6 مرات يوميًا لمدة 14 يومًا",
    /** tablet 1, twice a day, 1 week */
    tablet2x1w: "قرص واحد مرتين يوميًا لمدة أسبوع",
    /** tablet 1, 3 times a day, 2 weeks */
    tablet3x2w: "قرص واحد 3 مرات يوميًا لمدة أسبوعين",
    /** drop 1, 4 times a day */
    drop4x: "نقطة واحدة 4 مرات يوميًا",
    /** drop 1, 3 times a day */
    drop3x: "نقطة واحدة 3 مرات يوميًا",
    /** drop 1, right eye, 4 times a day */
    dropRight4x: "نقطة واحدة في العين اليمنى 4 مرات يوميًا",
    /** drops 2, left eye, 4 times a day */
    dropsLeft2x4x: "نقطتين في العين اليسرى 4 مرات يوميًا",
    /** The tapering business doc's example: drops 2 right eye 4×/day 1 week, then 1 drop 3×/day 1 week, then stop */
    taperExample: "نقطتين في العين اليمنى 4 مرات يوميًا لمدة أسبوع، ثم نقطة واحدة 3 مرات يوميًا لمدة أسبوع، ثم يتوقف",
    /** drop 1 both eyes: 4×/day 1 week, then twice a day 1 week, then once a day until the next visit (open end: no stop) */
    taperOpenEnd: "نقطة واحدة في العينين 4 مرات يوميًا لمدة أسبوع، ثم مرتين يوميًا لمدة أسبوع، ثم مرة واحدة يوميًا حتى الزيارة القادمة",
};
