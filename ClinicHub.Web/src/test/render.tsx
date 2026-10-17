import type {ReactElement, ReactNode} from "react";
import {act, render, type RenderOptions} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter, type Location, Route, Routes} from "react-router-dom";
import {QueryCache, QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {CacheProvider} from "@emotion/react";
import createCache from "@emotion/cache";
import {prefixer} from "stylis";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import {CssBaseline, ThemeProvider} from "@mui/material";
import {Toaster} from "react-hot-toast";
import {vi} from "vitest";
import i18n from "../i18n";
import {getLanguage, type LanguageCode} from "../i18n/languages.ts";
import {createAppTheme} from "../app/theme.ts";
import {AuthContext, type AuthValue} from "../features/auth/useAuth.ts";
import type {Context, Me} from "../features/auth/types.ts";
import type {Permission} from "../features/access/permissions.ts";
import {type ClipboardOptions, stubClipboard} from "./clipboard.ts";
import {aClinicContext, aMe, ALL_PERMISSIONS, anAuthResult, PLATFORM_CONTEXT, withRequirements} from "./data.ts";
import {toApiError} from "../api/errors.ts";
import {LocationProbe} from "./LocationProbe.tsx";

/** Who is using the app in the test. */
export type TestUser = {
    /**
     * The permissions of the user's role (default: every one, as the Owner); `/me` holds them with their requirements
     * (`withRequirements`), as the API returns them
     */
    permissions?: readonly Permission[];
    /** The current context: a clinic (default: clinic 1 "Clinic A"), "platform", or null (none chosen yet) */
    context?: Context | "platform" | null;
    /** Other contexts the user has (default: only the current one) */
    contexts?: Context[];
    /** `/me` as a whole, instead of the one built from the fields above */
    me?: Me;
};

export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
    /** The UI language (default "en"); "ar" also sets `<html dir="rtl">` and the RTL emotion cache */
    lang?: LanguageCode;
    /** The URL the app is at (default "/"), or the location with its state (e.g. `{pathname: "/login", state: {from}}`) */
    route?: string | Partial<Location>;
    /** The route pattern `ui` is mounted on, for `useParams` (default: any path) */
    path?: string;
    /** The logged-in user (default: the Owner of clinic 1); ignored when `auth` sets `status` other than authenticated */
    user?: TestUser;
    /**
     * The auth context (`useAuth()`) as the app's `AuthProvider` would give it: the default is built from `user`,
     * these fields replace it (e.g. `{status: "anonymous"}`, `{meReady: false}`, `{switchContext: vi.fn(…)}`).
     * Its functions are `vi.fn()` mocks the test can inspect.
     */
    auth?: Partial<AuthValue>;
    /** Your own QueryClient (default: `createTestQueryClient()`, a 5xx or network error retried once, as in the app) */
    queryClient?: QueryClient;
    /** A stubbed async clipboard and execCommand (see stubClipboard), returned as `clipboard` */
    clipboard?: ClipboardOptions;
};

/** The queries that answered 403 in a QueryClient of `createTestQueryClient` since the last `takeForbiddenQueries()`. */
const forbiddenQueries: string[] = [];

/** Empties and returns the list of queries that answered 403 (setup.ts fails a test that leaves any). */
export const takeForbiddenQueries = () => forbiddenQueries.splice(0);

/**
 * A QueryClient like the app's (AppProviders): a query is retried once, on a 5xx or a network error only (at once
 * here, not after the app's delay), so the requests a test sees are the app's. The app's global 403 handling (a
 * toast and `/me` reloaded) is not here: a query answering 403 fails the test (setup.ts), as only `startApp` shows
 * what the app does then.
 */
export const createTestQueryClient = () => new QueryClient({
    queryCache: new QueryCache({
        onError: (error, query) => {
            if (toApiError(error)?.status === 403) forbiddenQueries.push(JSON.stringify(query.queryKey));
        },
    }),
    defaultOptions: {
        queries: {
            retry: (failureCount, error) => failureCount < 1 && (toApiError(error)?.status ?? 500) >= 500,
            retryDelay: 0,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
        },
        mutations: {retry: false},
    },
});

// The app's emotion caches: MUI styles are flipped for right-to-left by the stylis RTL plugin
const emotionCaches = {
    ltr: createCache({key: "mui"}),
    rtl: createCache({key: "muirtl", stylisPlugins: [prefixer, rtlPlugin]}),
};

const resolveContext = (context: TestUser["context"]): Context | null =>
    context === undefined ? aClinicContext() : context === "platform" ? PLATFORM_CONTEXT : context;

/** The `useAuth()` value of a logged-in user (functions are mocks). */
export const buildAuth = (user: TestUser = {}, overrides: Partial<AuthValue> = {}): AuthValue => {
    const context = resolveContext(user.context);
    const me = user.me ?? aMe({
        context,
        permissions: context?.type === "clinic" ? withRequirements(user.permissions ?? ALL_PERMISSIONS) : [],
        user: {isSuperAdmin: context?.type === "platform"},
    });
    return {
        status: "authenticated",
        context,
        contexts: user.contexts ?? (context ? [context] : []),
        me,
        meReady: true,
        meFailed: false,
        meRetrying: false,
        retryMe: vi.fn(),
        signIn: vi.fn(),
        switchContext: vi.fn(async (to: Context) => anAuthResult({context: to})),
        logout: vi.fn(async () => undefined),
        retry: vi.fn(),
        ...overrides,
    };
};

/**
 * Renders `ui` inside the app's real providers: MUI theme (+ RTL emotion cache in Arabic), i18n in `lang` (and
 * `<html lang dir>`), a fresh QueryClient (`createTestQueryClient`), a MemoryRouter at `route`, the auth context of `user`, and the
 * Toaster (toasts are in the DOM). Returns Testing Library's result plus `user` (userEvent), `auth` (the mocks),
 * `queryClient`, `location()` and `clipboard` (with the `clipboard` option).
 *
 * @example
 * const {user, auth} = await renderWithProviders(<DrugsPage/>, {lang: "ar", user: {permissions: ["drugs.list"]}});
 */
export const renderWithProviders = async (ui: ReactElement, options: RenderWithProvidersOptions = {}) => {
    const {lang = "en", route = "/", path = "*", user, auth: authOverrides, queryClient = createTestQueryClient(), clipboard, ...rest} = options;
    await act(async () => {
        await i18n.changeLanguage(lang);
    });
    const dir = getLanguage(lang).dir;
    const theme = createAppTheme(dir);
    const auth = buildAuth(user, authOverrides);
    let current: Location | null = null;
    const setLocation = (location: Location) => {
        current = location;
    };

    const Providers = ({children}: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <CacheProvider value={emotionCaches[dir]}>
                <ThemeProvider theme={theme}>
                    <CssBaseline/>
                    <MemoryRouter initialEntries={[route]}>
                        <AuthContext.Provider value={auth}>
                            <LocationProbe onChange={setLocation}/>
                            {children}
                        </AuthContext.Provider>
                    </MemoryRouter>
                    <Toaster/>
                </ThemeProvider>
            </CacheProvider>
        </QueryClientProvider>
    );

    const result = render(
        <Routes>
            <Route path={path} element={ui}/>
            {path !== "*" && <Route path="*" element={null}/>}
        </Routes>,
        {wrapper: Providers, ...rest},
    );
    // No pause between keystrokes: same events, faster tests
    const userEvents = userEvent.setup({delay: null});
    return {
        ...result,
        user: userEvents,
        /** The stubbed clipboard (`clipboard` option; installed after userEvent.setup(), which installs its own) */
        clipboard: clipboard ? stubClipboard(clipboard) : undefined,
        auth,
        queryClient,
        /** Where the app is now (after navigations) */
        location: () => current!,
    };
};
