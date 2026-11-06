import {type ReactNode, StrictMode, useMemo} from "react";
import {createRoot} from "react-dom/client";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {CacheProvider} from "@emotion/react";
import createCache from "@emotion/cache";
import {prefixer} from "stylis";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import {Box, Button, CssBaseline, ThemeProvider, Typography} from "@mui/material";
import "../../../src/index.css";
import i18n from "../../../src/i18n/index.ts";
import {api, setAuthHandlers} from "../../../src/api/client.ts";
import {toApiError} from "../../../src/api/errors.ts";
import {createAppTheme} from "../../../src/app/theme.ts";
import {AppToaster} from "../../../src/components/common/AppToaster.tsx";
import {attachmentRequests} from "../../../src/features/attachments/attachmentRequests.ts";
import {AttachmentManager} from "../../../src/features/attachments/components/AttachmentManager.tsx";
import type {AttachmentManagerProps, AttachmentRules, AttachmentsAdapter} from "../../../src/features/attachments/types.ts";
import {useLanguage} from "../../../src/hooks/useLanguage.ts";
import {memoryAdapter} from "./memoryAdapter.ts";

/*
 * A page that only wires the attachment components, for Playwright and the user's walkthrough
 * (docs/design/attachments.components.contract.md § 3). Nothing here is part of the app: the texts of its own slots stay in
 * English on purpose, and its URL parameters choose the props.
 */

const params = new URLSearchParams(window.location.search);
/** A switch that is on unless the URL says `=0`. */
const isOn = (name: string) => params.get(name) !== "0";
const numberOf = (name: string) => {
    const value = params.get(name);
    return value === null ? undefined : Number(value);
};

/** The app's access token, in memory, refreshed by a plain call: only Playwright's `page.route` answers it. */
const installToken = () => {
    let token: string | null = "harness-token";
    let refreshing: Promise<string | null> | null = null;
    const refresh = async () => {
        try {
            const response = await fetch("/api/v1/auth/refresh", {method: "POST"});
            token = response.ok ? (await response.json() as { accessToken: string }).accessToken : null;
        } catch {
            token = null;
        }
        return token;
    };
    setAuthHandlers({
        getAccessToken: () => token,
        getContextKey: () => "clinic:1",
        refresh: () => (refreshing ??= refresh().finally(() => {
            refreshing = null;
        })),
    });
};

const realAdapter = (): AttachmentsAdapter => {
    installToken();
    return {
        ...attachmentRequests("/test-files"),
        scope: ["attachments-harness"],
        rules: () => api.get<AttachmentRules>("/test-files/rules").then(response => response.data),
    };
};

const adapter = params.get("mode") === "real"
    ? realAdapter()
    : memoryAdapter({seed: params.get("seed") !== "none", maxFileSizeBytes: numberOf("maxSize")});

/** Every custom render slot (design § 12, level 2), to see that each replaces its part and its actions work. */
const CUSTOM_SLOTS: Pick<AttachmentManagerProps, "renderTrigger" | "renderItem" | "renderSelectedItem" | "renderEmpty" | "renderPreview"> = {
    renderTrigger: ({open, dropProps, isDragActive, disabled}) => (
        <Box {...dropProps} data-testid="custom-trigger" sx={{p: 2, border: "2px dashed", borderColor: isDragActive ? "primary.main" : "divider"}}>
            <Button onClick={open} disabled={disabled}>Custom pick</Button>
        </Box>
    ),
    renderSelectedItem: (item, actions) => (
        <Box data-testid="custom-selected-item" sx={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1}}>
            <Box component="span" dir="auto" sx={{overflowWrap: "anywhere"}}>{item.file.name}</Box>
            <Typography component="span" variant="body2">{item.status}</Typography>
            <Button onClick={actions.remove}>Custom remove</Button>
            <Button onClick={actions.cancel}>Custom cancel</Button>
            <Button onClick={actions.retry}>Custom retry</Button>
            <Button onClick={actions.preview}>Custom preview</Button>
        </Box>
    ),
    renderItem: (file, actions) => (
        <Box data-testid="custom-item" sx={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1}}>
            <Box component="span" dir="auto" sx={{overflowWrap: "anywhere"}}>{file.originalFileName}</Box>
            <Button onClick={actions.download}>Custom download</Button>
            <Button onClick={actions.preview}>Custom preview</Button>
            {actions.replace && <Button onClick={actions.replace}>Custom replace</Button>}
            {actions.cancelReplace && <Button onClick={actions.cancelReplace}>Custom cancel replace</Button>}
            {actions.delete && <Button onClick={actions.delete}>Custom delete</Button>}
        </Box>
    ),
    renderEmpty: () => <Typography data-testid="custom-empty">Custom empty</Typography>,
    renderPreview: preview => (
        <Box data-testid="custom-preview">
            <Typography dir="auto" sx={{overflowWrap: "anywhere"}}>{preview.name}</Typography>
            <Button onClick={preview.download}>Custom save</Button>
        </Box>
    ),
};

const managerProps = {
    adapter,
    multiple: isOn("multiple"),
    maxFiles: numberOf("maxFiles"),
    canUpload: isOn("canUpload"),
    canReplace: isOn("canReplace"),
    canDelete: isOn("canDelete"),
    ...(params.get("slots") === "1" ? CUSTOM_SLOTS : {}),
} satisfies AttachmentManagerProps;

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => failureCount < 1 && (toApiError(error)?.status ?? 500) >= 500,
            refetchOnWindowFocus: false,
        },
    },
});

// As in AppProviders: MUI styles are flipped for right-to-left languages by a dedicated emotion cache
const emotionCaches = {
    ltr: createCache({key: "mui"}),
    rtl: createCache({key: "muirtl", stylisPlugins: [prefixer, rtlPlugin]}),
};

export const Providers = ({children}: { children: ReactNode }) => {
    const {dir} = useLanguage();
    const theme = useMemo(() => createAppTheme(dir), [dir]);
    return (
        <QueryClientProvider client={queryClient}>
            <CacheProvider value={emotionCaches[dir]}>
                <ThemeProvider theme={theme}>
                    <CssBaseline/>
                    {children}
                    <AppToaster/>
                </ThemeProvider>
            </CacheProvider>
        </QueryClientProvider>
    );
};

const render = () => createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <Providers>
            <Box component="main" sx={{maxWidth: 900, mx: "auto", p: 2}}>
                <Typography variant="h5" component="h1" sx={{mb: 2}}>Attachments harness</Typography>
                <AttachmentManager {...managerProps}/>
            </Box>
        </Providers>
    </StrictMode>,
);

const lang = params.get("lang");
if (lang === "ar" || lang === "en") void i18n.changeLanguage(lang).then(render);
else render();
