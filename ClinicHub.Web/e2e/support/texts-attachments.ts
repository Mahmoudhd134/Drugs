import type {Lang} from "./texts.ts";

/**
 * The expected texts of the attachment components, written out like `texts.ts` (never imported from the locale files,
 * so a changed message fails a test). Source: docs/design/attachments.components.contract.md § 2 ("Screen structure and
 * names") and the business file's messages. A name inside a message sits in the bidi isolates U+2068/U+2069.
 */
const iso = (name: string) => `⁨${name}⁩`;

const ar = {
    pick: "اختيار ملفات",
    dropHint: "أو اسحبها وأفلتها هنا",
    selectedLabel: "الملفات المختارة",
    storedLabel: "الملفات المحفوظة",
    upload: "رفع",
    download: "تنزيل",
    downloadAll: "تنزيل الكل",
    empty: "لا توجد ملفات بعد.",
    removeFile: (name: string) => `إزالة «${iso(name)}»`,
    retryFile: (name: string) => `إعادة محاولة رفع «${iso(name)}»`,
    previewFile: (name: string) => `معاينة «${iso(name)}»`,
    downloadFile: (name: string) => `تنزيل «${iso(name)}»`,
    deleteFile: (name: string) => `حذف «${iso(name)}»`,
    replaceFile: (name: string) => `استبدال «${iso(name)}»`,
    cancelFile: (name: string) => `إلغاء رفع «${iso(name)}»`,
    deleteTitle: (name: string) => `حذف «${iso(name)}»؟`,
    deleteMessage: "لن يظهر هنا بعد ذلك.",
    deleted: "تم حذف الملف",
    previewOf: (name: string) => `معاينة «${iso(name)}»`,
    noPreview: "لا تتوفر معاينة لهذا النوع من الملفات. يمكنك تنزيله.",
    sizeB: (value: number) => `${value} بايت`,
    sizeKb: (value: string) => `${value} كيلوبايت`,
    typeNotAllowed: "نوع هذا الملف غير مسموح به.",
    // common.*
    close: "إغلاق",
    cancel: "إلغاء",
    delete: "حذف",
};

export type AttachmentTexts = typeof ar;

const en: AttachmentTexts = {
    pick: "Choose files",
    dropHint: "or drop them here",
    selectedLabel: "Selected files",
    storedLabel: "Stored files",
    upload: "Upload",
    download: "Download",
    downloadAll: "Download all",
    empty: "No files yet.",
    removeFile: name => `Remove “${iso(name)}”`,
    retryFile: name => `Retry uploading “${iso(name)}”`,
    previewFile: name => `Preview “${iso(name)}”`,
    downloadFile: name => `Download “${iso(name)}”`,
    deleteFile: name => `Delete “${iso(name)}”`,
    replaceFile: name => `Replace “${iso(name)}”`,
    cancelFile: name => `Cancel uploading “${iso(name)}”`,
    deleteTitle: name => `Delete “${iso(name)}”?`,
    deleteMessage: "It will no longer show here.",
    deleted: "File deleted",
    previewOf: name => `Preview of “${iso(name)}”`,
    noPreview: "No preview is available for this type of file. You can download it.",
    sizeB: value => `${value} B`,
    sizeKb: value => `${value} KB`,
    typeNotAllowed: "This file type isn't allowed.",
    // common.*
    close: "Close",
    cancel: "Cancel",
    delete: "Delete",
};

export const ATTACHMENT_TEXTS: Record<Lang, AttachmentTexts> = {ar, en};
