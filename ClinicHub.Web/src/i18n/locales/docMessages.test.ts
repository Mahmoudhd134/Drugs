import {beforeEach, describe, expect, test} from "vitest";
import {AxiosError, AxiosHeaders} from "axios";
import i18n from "../index.ts";
import {getErrorMessage} from "../../api/errors.ts";
import accessDoc from "../../../../docs/features/access/business.md?raw";
import authDoc from "../../../../docs/features/auth/business.md?raw";
import scopingDoc from "../../../../docs/features/clinic-scoping/business.md?raw";
import dosingDoc from "../../../../docs/features/dosing/business.md?raw";
import protocolsDoc from "../../../../docs/features/protocols/business.md?raw";
import drugsDoc from "../../../../docs/features/drugs/business.md?raw";
import adminDoc from "../../../../docs/features/platform-admin/business.md?raw";
import sharedCatalogDoc from "../../../../docs/features/shared-catalog/business.md?raw";
import prescriptionDoc from "../../../../docs/features/prescription/business.md?raw";
import taperingDoc from "../../../../docs/features/tapering/business.md?raw";

/*
 * I18N-013: every message the business docs quote («الرسائل التي تظهر للمستخدم» of every feature) is the Arabic text
 * the app shows. Each doc message (or each part of it) is mapped to the ar.ts text that shows it, rendered with the
 * doc's own placeholder names (e.g. «اسم العيادة»); the bidi isolates the app adds around names are not in the docs.
 * Every row of every table must be mapped (or listed below as a description, not a text), so a new doc message fails
 * this test until it is mapped.
 */

const t = (key: string, options: Record<string, unknown> = {}) => i18n.getFixedT("ar")(key, options);
const stripIsolates = (text: string) => text.replace(/[⁨⁩]/g, "");

/** The message of a login or picker refusal naming clinics, through the app's own reading of the error. */
const refusal = (code: string, clinicNames: string[]) => getErrorMessage(new AxiosError("refused", "ERR_BAD_REQUEST", undefined, null, {
    status: 403, statusText: "Forbidden", headers: {}, config: {headers: new AxiosHeaders()},
    data: {status: 403, code, errors: [{code, description: code}], clinicNames},
}));

/** The rows of a doc's «الرسائل التي تظهر للمستخدم» table: [situation, message]. */
const messageRows = (doc: string) => {
    const section = doc.split("## الرسائل التي تظهر للمستخدم")[1]?.split(/\n## /)[0] ?? "";
    return section.split("\n")
        .filter(line => line.startsWith("|") && !line.startsWith("|---") && !line.startsWith("| الحالة |"))
        .map(line => line.split("|").slice(1, -1).map(cell => cell.trim()));
};

type Entry = [docText: string, render: () => string];

const DOCS: { name: string; doc: string; entries: Entry[]; descriptions?: string[] }[] = [
    {
        name: "access", doc: accessDoc, entries: [
            ["غير مسموح لك بهذا الإجراء.", () => t("errors.forbidden")],
            ["ليست لديك صلاحية", () => t("access.noPermissionTooltip")],
            ["لا توجد صلاحية", () => t("access.noPermissionTitle")],
            ["ليست لديك صلاحية لفتح هذه الصفحة. اطلبها من مالك العيادة إن احتجت إليها.", () => t("access.noPermissionDescription")],
            ["لم تعد لديك صلاحية دخول «اسم العيادة». اختر أين تريد المتابعة.", () => t("auth.clinicLostChoose", {from: "اسم العيادة"})],
            ["لم تعد لديك صلاحية دخول «اسم العيادة». أنت الآن في «اسم العيادة الأخرى».",
                () => t("auth.clinicLostMoved", {from: "اسم العيادة", to: "اسم العيادة الأخرى"})],
            ["لم تعد لديك صلاحية دخول «اسم العيادة» ولا أي عيادة أخرى.", () => t("auth.clinicLostEnded", {from: "اسم العيادة"})],
            ["العيادة «اسم العيادة» موقوفة.", () => refusal("clinicSuspended", ["اسم العيادة"])],
            ["تم إيقاف حسابك في «اسم العيادة». تواصل مع مالك العيادة.", () => refusal("staffInactive", ["اسم العيادة"])],
            ["هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.", () => t("errors.noAccess")],
        ],
    },
    {
        name: "auth", doc: authDoc, entries: [
            ["أدخل رقم موبايل صحيحًا.", () => t("errors.invalidPhone")],
            ["الكود غير صحيح. راجعه وحاول مرة أخرى.", () => t("errors.invalidCode")],
            ["انتهت صلاحية هذا الكود. اطلب كودًا جديدًا.", () => t("errors.codeExpired")],
            ["محاولات خاطئة كثيرة. اطلب كودًا جديدًا.", () => t("errors.tooManyAttempts")],
            ["طلبات أكواد كثيرة. انتظر قليلًا ثم حاول مرة أخرى.", () => t("errors.tooManyRequests")],
            ["العيادة «اسم العيادة» موقوفة.", () => refusal("clinicSuspended", ["اسم العيادة"])],
            ["العيادتان «أ» و«ب» موقوفتان.", () => refusal("clinicSuspended", ["أ", "ب"])],
            ["العيادات «أ» و«ب» و«ج» موقوفة.", () => refusal("clinicSuspended", ["أ", "ب", "ج"])],
            ["تم إيقاف حسابك في «اسم العيادة». تواصل مع مالك العيادة.", () => refusal("staffInactive", ["اسم العيادة"])],
            ["تم إيقاف حسابك في العيادتين «أ» و«ب». تواصل مع مالك كل عيادة.", () => refusal("staffInactive", ["أ", "ب"])],
            ["تم إيقاف حسابك في العيادات «أ» و«ب» و«ج». تواصل مع مالك كل عيادة.", () => refusal("staffInactive", ["أ", "ب", "ج"])],
            ["هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.", () => t("errors.noAccess")],
            ["لم تعد لديك صلاحية دخول «اسم العيادة». اختر أين تريد المتابعة.", () => t("auth.clinicLostChoose", {from: "اسم العيادة"})],
            ["لم تعد لديك صلاحية دخول «اسم العيادة». أنت الآن في «اسم العيادة الأخرى».",
                () => t("auth.clinicLostMoved", {from: "اسم العيادة", to: "اسم العيادة الأخرى"})],
            ["لم تعد لديك صلاحية دخول «اسم العيادة» ولا أي عيادة أخرى.", () => t("auth.clinicLostEnded", {from: "اسم العيادة"})],
            ["سجّل مستخدم آخر الدخول من تبويب آخر، وهذا التبويب يستخدم حسابه الآن.", () => t("auth.otherUserSignedIn")],
            ["لم تعد لديك صلاحية دخول «إدارة المنصة». سجّل الدخول من جديد للمتابعة.",
                () => t("auth.clinicLostSignedOut", {from: t("auth.platform")})],
            ["وضع عرض الكود: يظهر الكود هنا بدل إرساله برسالة SMS (للتطوير فقط).", () => t("auth.displayModeBanner")],
            ["أنت تعدّل العيادة النموذجية. التغييرات تُنسخ إلى العيادات التي تُنشأ لاحقًا، وليس إلى العيادات الحالية.", () => t("auth.templateBanner")],
            ["«العودة إلى إدارة المنصة»", () => `«${t("admin.backToAdmin")}»`],
            ["تعذّر الاتصال بالخادم. تحقّق من الاتصال.", () => t("errors.network")],
            ["«إعادة المحاولة»", () => `«${t("common.retry")}»`],
            ["غير مسموح لك بهذا الإجراء.", () => t("errors.forbidden")],
            ["لا توجد عيادة متاحة لرقمك.", () => t("auth.noContexts")],
        ],
    },
    {
        name: "clinic-scoping", doc: scopingDoc, entries: [
            ["هذا العنصر لم يعد موجودًا.", () => t("errors.notFound")],
            ["أحد الأدوية لم يعد موجودًا.", () => t("errors.drugNotFound")],
        ],
    },
    {
        name: "dosing", doc: dosingDoc, entries: [
            ["بعض بيانات الجرعة ناقصة أو غير صحيحة.", () => t("errors.invalidDosing")],
            ["لا توجد جرعة محددة", () => t("dosing.noDosing")],
        ],
    },
    {
        name: "protocols", doc: protocolsDoc, entries: [
            ["تم إنشاء البروتوكول", () => t("protocols.created")],
            ["تم تحديث البروتوكول", () => t("protocols.updated")],
            ["تم حذف البروتوكول", () => t("protocols.deleted")],
            // M1.7b: a protocol saved with a drug the admin disabled (design M1.7 D6)
            ["«اسم الدواء» معطّل من الإدارة ولا يمكن إضافته.", () => t("protocols.drugWithdrawnNamed", {name: "اسم الدواء"})],
            ["الاسم مطلوب.", () => t("errors.nameRequired")],
            ["أضف دواءً واحدًا على الأقل.", () => t("errors.drugsRequired")],
            ["«اسم الدواء» موجود بالفعل في هذا البروتوكول لنفس العين", () => t("protocols.alreadyInProtocolForEye", {name: "اسم الدواء"})],
            ["نفس الدواء والعين في سطر آخر", () => t("protocols.eyeClash")],
            ["يوجد دواء مكرر في البروتوكول لنفس العين (مُعلَّم بالأسفل). احذف أحد السطرين أو غيّر العين، ثم احفظ.", () => t("protocols.eyeClashSave")],
            ["يوجد دواء مكرر في البروتوكول لنفس العين.", () => t("errors.duplicateProtocolItem")],
            ["تجاهل التغييرات؟", () => t("protocols.discardTitle")],
        ],
    },
    {
        name: "drugs", doc: drugsDoc, entries: [
            ["تمت إضافة الدواء", () => t("drugs.created")],
            ["تم تحديث الدواء", () => t("drugs.updated")],
            ["تم حذف الدواء", () => t("drugs.deleted")],
            // M1.7b: the required category (design M1.7 D9)
            ["التصنيف مطلوب.", () => t("errors.categoryRequired")],
            ["هذا التصنيف لم يعد موجودًا. اختر تصنيفًا آخر.", () => t("errors.categoryNotFound")],
            ["هذا التصنيف الفرعي غير موجود في التصنيف المختار.", () => t("errors.subCategoryNotFound")],
            ["النص طويل جدًا.", () => t("errors.textTooLong")],
            ["لا يمكن تعديل الأدوية المشتركة.", () => t("errors.sharedDrugReadOnly")],
            ["الاسم مطلوب.", () => t("errors.nameRequired")],
            ["لا توجد أدوية مطابقة للبحث.", () => t("drugs.noResults")],
            // M1.7c: the drugs page's empty states (contract § 2.3 drugListEmptyState) and their buttons
            ["لا توجد أدوية خاصة بالعيادة بعد.", () => t("drugs.noOwnDrugs")],
            ["لا توجد أدوية مطابقة للفلاتر.", () => t("drugs.noFilterResults")],
            ["«مسح الفلاتر»", () => `«${t("drugs.clearFilters")}»`],
            ["لا توجد أدوية بعد", () => t("drugs.emptyTitle")],
            ["«إضافة دواء»", () => `«${t("drugs.add")}»`],
        ],
        // The fields turn red: a behavior, not a text
        descriptions: ["تظهر الحقول الناقصة باللون الأحمر ولا يتم الحفظ"],
    },
    {
        name: "platform-admin", doc: adminDoc, entries: [
            ["العيادة «اسم العيادة» موقوفة.", () => refusal("clinicSuspended", ["اسم العيادة"])],
            ["تم إيقاف حسابك في «اسم العيادة». تواصل مع مالك العيادة.", () => refusal("staffInactive", ["اسم العيادة"])],
            ["هذا الرقم ليس له صلاحية دخول. اطلب من عيادتك إضافتك.", () => t("errors.noAccess")],
            ["لم تعد لديك صلاحية دخول «اسم العيادة». اختر أين تريد المتابعة.", () => t("auth.clinicLostChoose", {from: "اسم العيادة"})],
            ["لم تعد لديك صلاحية دخول «اسم العيادة». أنت الآن في «اسم العيادة الأخرى».",
                () => t("auth.clinicLostMoved", {from: "اسم العيادة", to: "اسم العيادة الأخرى"})],
            ["لم تعد لديك صلاحية دخول «اسم العيادة» ولا أي عيادة أخرى.", () => t("auth.clinicLostEnded", {from: "اسم العيادة"})],
            ["هذا العنصر لم يعد موجودًا.", () => t("errors.notFound")],
            ["الاسم مطلوب.", () => t("errors.nameRequired")],
            ["رقم الموبايل مطلوب.", () => t("admin.create.phoneRequired")],
            ["رقم الموبايل مطلوب.", () => t("staff.editor.phoneRequired")],
            ["الاسم طويل جدًا.", () => t("errors.nameTooLong")],
            ["الاسم يحتوي على رموز غير مسموح بها.", () => t("errors.nameInvalid")],
            ["لم تعد لديك صلاحية دخول «إدارة المنصة». سجّل الدخول من جديد للمتابعة.",
                () => t("auth.clinicLostSignedOut", {from: t("auth.platform")})],
            ["أدخل رقم موبايل صحيحًا.", () => t("errors.invalidPhone")],
            ["غير مسموح لك بهذا الإجراء.", () => t("errors.forbidden")],
            ["تم إنشاء «اسم العيادة»", () => t("admin.create.created", {name: "اسم العيادة"})],
            ["تم تغيير اسم العيادة", () => t("admin.clinic.renamed")],
            ["تم إيقاف العيادة", () => t("admin.clinic.disabled")],
            ["تم تفعيل العيادة", () => t("admin.clinic.enabled")],
            ["العيادة موقوفة: لا يستطيع موظفوها دخولها. فعّلها ليعود لهم الدخول.", () => t("admin.clinic.suspendedInfo")],
            ["إيقاف «اسم العيادة»؟", () => t("admin.clinic.disableTitle", {name: "اسم العيادة"})],
            ["يفقد موظفوها الدخول بمجرد قيامهم بأي إجراء تالٍ، حتى من يعمل داخلها الآن. لا يُحذف شيء، ويمكنك تفعيلها من جديد في أي وقت.",
                () => t("admin.clinic.disableMessage")],
            ["حذف هذه العيادة؟", () => t("admin.clinic.deleteTitle")],
            ["تختفي العيادة من كل القوائم ويفقد موظفوها الدخول بمجرد قيامهم بأي إجراء تالٍ. تبقى بياناتها محفوظة، لكن لا يمكن استرجاعها من داخل النظام.",
                () => t("admin.clinic.deleteMessage")],
            ["للتأكيد، اكتب اسم العيادة:", () => t("admin.clinic.deleteTypeName")],
            ["«اسم العيادة»: اكتب الاسم تمامًا كما يظهر", () => `«${t("admin.clinic.name")}»: ${t("admin.clinic.deleteTypeHint")}`],
            ["تم حذف «اسم العيادة»", () => t("admin.clinic.deleted", {name: "اسم العيادة"})],
            ["لا توجد عيادات بعد", () => t("admin.clinics.emptyTitle")],
            ["أنشئ أول عيادة. يستطيع مالكها الدخول فورًا ويجد فيها الأدوية والبروتوكولات الافتراضية.", () => t("admin.clinics.emptyDescription")],
            ["لا توجد عيادات مطابقة للبحث أو الفلتر.", () => t("admin.clinics.noResults")],
            ["تعذّر تحميل البيانات.", () => t("common.loadFailed")],
            ["«إعادة المحاولة»", () => `«${t("common.retry")}»`],
            ["تعذّر تحميل هذه الصفحة. تحقّق من الاتصال، ثم أعد تحميل الصفحة.", () => `${t("common.pageFailed")} ${t("common.pageFailedHint")}`],
            ["«إعادة التحميل»", () => `«${t("common.reload")}»`],
            ["العيادة غير موجودة. هذه العيادة غير موجودة أو تم حذفها.",
                () => `${t("admin.clinic.notFoundTitle")}. ${t("admin.clinic.notFoundDescription")}`],
            ["تم إنشاء الدور «اسم الدور»", () => t("roles.created", {name: "اسم الدور"})],
            ["تم حفظ الدور «اسم الدور»", () => t("roles.updated", {name: "اسم الدور"})],
            ["تم حذف الدور «اسم الدور»", () => t("roles.deleted", {name: "اسم الدور"})],
            ["حذف الدور «اسم الدور»؟ لا يمكن التراجع عن ذلك. لا يمكن حذف دور ممنوح لموظفين: أزِل هذا الدور من موظفيه أولًا.",
                () => `${t("roles.deleteTitle", {name: "اسم الدور"})} ${t("roles.deleteMessage")}`],
            ["يوجد دور آخر في هذه العيادة بنفس الاسم.", () => t("errors.roleNameTaken")],
            ["إحدى الصلاحيات غير موجودة.", () => t("errors.unknownPermission")],
            ["لا يمكن تعديل دور «المالك» أو حذفه.", () => t("errors.roleLocked")],
            ["هذا الدور ممنوح لموظفين. أزِل هذا الدور من موظفيه أولًا.", () => t("errors.roleInUse")],
            ["تمت إضافة «الاسم»", () => t("staff.added", {name: "الاسم"})],
            ["تم حفظ «الاسم»", () => t("staff.updated", {name: "الاسم"})],
            ["تمت إزالة «الاسم»", () => t("staff.removed", {name: "الاسم"})],
            ["إزالة «الاسم» من العيادة؟ يفقد الدخول إلى هذه العيادة بمجرد قيامه بأي إجراء تالٍ. يبقى حسابه وعياداته الأخرى كما هي، ويمكنك إضافته من جديد لاحقًا.",
                () => `${t("staff.removeTitle", {name: "الاسم"})} ${t("staff.removeMessage")}`],
            ["لا يوجد موظفون بعد", () => t("staff.emptyTitle")],
            ["أضف الأشخاص برقم الموبايل واختر أدوارهم.", () => t("staff.emptyDescription")],
            ["لا يوجد موظفون مطابقون للبحث.", () => t("staff.noResults")],
            ["اختر دورًا واحدًا على الأقل.", () => t("errors.rolesRequired")],
            ["أحد الأدوار لم يعد موجودًا.", () => t("errors.roleNotFound")],
            ["هذا الرقم مسجّل بالفعل كموظف في هذه العيادة.", () => t("errors.staffExists")],
            ["يجب أن يبقى للعيادة موظف نشط واحد على الأقل له دور «المالك». أعطِ دور «المالك» لموظف نشط آخر أولًا، ثم حاول مرة أخرى.",
                () => `${t("errors.lastOwner")} ${t("staff.lastOwnerHint")}`],
        ],
    },
    {
        name: "prescription", doc: prescriptionDoc, entries: [
            ["«اسم الدواء» موجود بالفعل في القائمة", () => t("prescription.alreadyAdded", {name: "اسم الدواء"})],
            ["«اسم الدواء» موجود بالفعل في القائمة لنفس العين", () => t("prescription.eyeTaken", {name: "اسم الدواء"})],
            ["أي عين؟", () => t("prescription.chooseEyeTitle")],
            // M1.7b: the ⚠ toast after a protocol with lines disabled by the admin (design M1.7 D6)
            ["أُضيف رغم تعطيله من الإدارة: العدد", () => t("prescription.protocolWithdrawn", {count: "العدد"})],
            ["جرعتان لنفس العين", () => t("prescription.protocolClashTitle")],
            ["«اسم الدواء» موجود في البروتوكول مرتين للعين التي اخترتها، بجرعتين مختلفتين. أي جرعة تُضاف؟",
                () => t("prescription.protocolClashMessage", {name: "اسم الدواء"})],
            ["استخدام الأولى", () => t("prescription.useFirst")],
            ["استخدام الثانية", () => t("prescription.useSecond")],
            ["موجود بالفعل في الروشتة", () => t("prescription.conflictTitle")],
            ["تمت الإضافة من «اسم البروتوكول»: العدد", () => t("prescription.protocolAdded", {name: "اسم البروتوكول", count: "العدد"})],
            ["تم الاستبدال بجرعة البروتوكول: العدد", () => t("prescription.protocolReplaced", {count: "العدد"})],
            ["تم الإبقاء على الجرعة الحالية: العدد", () => t("prescription.protocolKept", {count: "العدد"})],
            ["موجود مسبقًا في القائمة: العدد", () => t("prescription.protocolSkipped", {count: "العدد"})],
            ["مكرر في البروتوكول ولم يُضف: العدد", () => t("prescription.protocolDuplicated", {count: "العدد"})],
            ["تم النسخ", () => t("common.copied")],
            ["تعذّر النسخ. حدّد النص وانسخه يدويًا.", () => t("errors.copyFailed")],
            ["تم مسح القائمة", () => t("prescription.cleared")],
            ["زر تراجع", () => `زر ${t("common.undo")}`],
        ],
    },
    {
        // M1.7 shared catalog (its business doc's «الرسائل التي تظهر للمستخدم (جديدة)»)
        name: "shared-catalog", doc: sharedCatalogDoc, entries: [
            ["مشترك", () => t("drugs.chip.shared")],
            ["خاص بالعيادة", () => t("drugs.chip.own")],
            ["الكل", () => t("drugs.source.all")],
            ["المشتركة", () => t("drugs.source.shared")],
            ["أدوية العيادة", () => t("drugs.source.own")],
            ["بدون تصنيف فرعي", () => t("drugs.noSubCategory")],
            ["النتائج: N", () => t("common.results", {count: "N"})],
            ["لا توجد أدوية مطابقة للبحث.", () => t("drugs.noResults")],
            ["لا توجد أدوية خاصة بالعيادة بعد.", () => t("drugs.noOwnDrugs")],
            ["لا توجد أدوية مطابقة للفلاتر.", () => t("drugs.noFilterResults")],
            ["«مسح الفلاتر»", () => `«${t("drugs.clearFilters")}»`],
            ["التصنيف: «التصنيف» › «التصنيف الفرعي»", () => t("drugs.categoryLine", {path: "«التصنيف» › «التصنيف الفرعي»"})],
            ["لا توجد جرعة محددة", () => t("dosing.noDosing")],
            ["التصنيف مطلوب.", () => t("errors.categoryRequired")],
            ["هذا التصنيف لم يعد موجودًا. اختر تصنيفًا آخر.", () => t("errors.categoryNotFound")],
            ["هذا التصنيف الفرعي غير موجود في التصنيف المختار.", () => t("errors.subCategoryNotFound")],
            ["لا يمكن تعديل الأدوية المشتركة.", () => t("errors.sharedDrugReadOnly")],
            ["معطّل من الإدارة", () => t("drugs.withdrawn.chip")],
            ["عطّل مدير المنصة هذا الدواء في الكتالوج المشترك، فلا يظهر في البحث. يبقى في البروتوكولات التي تستخدمه.",
                () => t("drugs.withdrawn.tooltip")],
            ["معطّل من الإدارة: N", () => t("drugs.withdrawn.count", {count: "N"})],
            ["بعض الأدوية عطّلها مدير المنصة في الكتالوج المشترك.", () => t("protocols.withdrawnAlert")],
            ["«اسم الدواء» معطّل من الإدارة ولا يمكن إضافته.", () => t("protocols.drugWithdrawnNamed", {name: "اسم الدواء"})],
            ["أُضيف رغم تعطيله من الإدارة: N", () => t("prescription.protocolWithdrawn", {count: "N"})],
            ["تعطيل الدواء", () => t("adminDrugs.withdraw")],
            ["تفعيل الدواء", () => t("adminDrugs.restore")],
            ["تعطيل «اسم الدواء»؟ سيختفي من البحث في كل العيادات ويبقى في البروتوكولات التي تستخدمه. يمكنك تفعيله لاحقًا.",
                () => `${t("adminDrugs.withdrawTitle", {name: "اسم الدواء"})} ${t("adminDrugs.withdrawMessage")}`],
            ["تم تعطيل الدواء", () => t("adminDrugs.withdrawnToast")],
            ["تم تفعيل الدواء", () => t("adminDrugs.restoredToast")],
            ["مفعّل", () => t("adminDrugs.status.active")],
            ["معطّل", () => t("adminDrugs.status.withdrawn")],
            ["لا توجد أدوية معطّلة.", () => t("adminDrugs.noWithdrawn")],
            ["يوجد تصنيف بهذا الاسم.", () => t("errors.categoryNameTaken")],
            ["يوجد تصنيف فرعي بهذا الاسم في نفس التصنيف.", () => t("errors.subCategoryNameTaken")],
            ["لا يمكن حذف هذا التصنيف: يستخدمه N دواء.", () => t("errors.categoryInUse_counted_other", {count: "N"})],
            ["لا يمكن حذف هذا التصنيف الفرعي: يستخدمه N دواء.", () => t("errors.subCategoryInUse_counted_other", {count: "N"})],
            ["من عيادات محذوفة: N", () => t("adminCategories.deletedClinics", {count: "N"})],
            ["حذف التصنيف «الاسم»؟ ستُحذف معه تصنيفاته الفرعية. لا يمكن التراجع عن ذلك.",
                () => `${t("adminCategories.deleteCategoryTitle", {name: "الاسم"})} ${t("adminCategories.deleteCategoryMessage")}`],
            ["حذف التصنيف الفرعي «الاسم»؟ لا يمكن التراجع عن ذلك.",
                () => `${t("adminCategories.deleteSubCategoryTitle", {name: "الاسم"})} ${t("adminCategories.deleteSubCategoryMessage")}`],
        ],
    },
    {
        name: "tapering", doc: taperingDoc, entries: [
            ["بعض بيانات الجرعة ناقصة أو غير صحيحة.", () => t("errors.invalidDosing")],
            ["المرحلة الأخيرة فقط يمكن أن تكون «بصفة مستمرة» أو «حتى الزيارة القادمة».", () => t("dosing.taper.lastStepInfo")],
            ["راجع الأرقام. أقصى عدد للمراحل 10.", () => t("dosing.taper.invalid", {max: 10})],
            ["أقصى عدد للمراحل: 10", () => t("dosing.taper.maxSteps", {count: 10})],
        ],
    },
];

describe("messages of the business docs @area:i18n", () => {
    beforeEach(async () => {
        await i18n.changeLanguage("ar");
    });

    test.each(DOCS)("$name: every quoted message is the Arabic text the app shows @I18N-013", ({doc, entries, descriptions = []}) => {
        const rows = messageRows(doc);
        expect(rows.length).toBeGreaterThan(0);
        const messages = rows.map(row => row[row.length - 1]);

        for (const [docText, render] of entries) {
            expect(messages.some(message => message.includes(docText)), `not in the doc's table: ${docText}`).toBe(true);
            expect(stripIsolates(render())).toBe(docText);
        }
        // Every row is mapped (or is a description of a behavior, not a text)
        for (const message of messages) {
            const mapped = entries.some(([docText]) => message.includes(docText)) || descriptions.includes(message);
            expect(mapped, `row not mapped: ${message}`).toBe(true);
        }
    });
});
