/**
 * Copies text to the clipboard. Falls back to execCommand when the async
 * Clipboard API is unavailable, which is the case on plain-http hosts
 * (e.g. the app opened over the clinic LAN by IP address).
 */
export const copyText = async (text: string): Promise<boolean> => {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through to the legacy approach
        }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand("copy");
    } finally {
        document.body.removeChild(textarea);
    }
};

/**
 * Copies formatted HTML (bold, lists, alignment… kept when pasting into Word)
 * together with a plain-text version for apps that don't accept HTML.
 */
export const copyRichText = async (html: string, text: string): Promise<boolean> => {
    if (navigator.clipboard?.write && window.isSecureContext && typeof ClipboardItem !== "undefined") {
        try {
            await navigator.clipboard.write([new ClipboardItem({
                "text/html": new Blob([html], {type: "text/html"}),
                "text/plain": new Blob([text], {type: "text/plain"}),
            })]);
            return true;
        } catch {
            // fall through to the legacy approach
        }
    }

    // Plain-http hosts: fill both formats from a copy event
    const onCopy = (e: ClipboardEvent) => {
        e.clipboardData?.setData("text/html", html);
        e.clipboardData?.setData("text/plain", text);
        e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    try {
        return document.execCommand("copy");
    } finally {
        document.removeEventListener("copy", onCopy);
    }
};
