import {type ReactNode, useMemo} from "react";
import {MutationCache, QueryCache, QueryClient, QueryClientProvider} from "@tanstack/react-query";
import axios from "axios";
import toast from "react-hot-toast";
import {CacheProvider} from "@emotion/react";
import createCache from "@emotion/cache";
import {prefixer} from "stylis";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import {CssBaseline, ThemeProvider} from "@mui/material";
import {Toaster} from "react-hot-toast";
import {createAppTheme} from "./theme.ts";
import {useLanguage} from "../hooks/useLanguage.ts";
import {AuthProvider} from "../features/auth/AuthProvider.tsx";
import {getErrorMessage} from "../api/errors.ts";
import {authKeys} from "../features/auth/api.ts";

const isForbidden = (error: unknown) => axios.isAxiosError(error) && error.response?.status === 403;

/**
 * A 403 means the permissions shown are out of date (changed by an admin, staff deactivated, clinic
 * suspended): reload them from /me so the UI catches up. Queries also toast the translated reason
 * (pages already toast their own mutation errors).
 */
const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({
        onError: (error) => {
            if (!isForbidden(error)) return;
            toast.error(getErrorMessage(error), {id: "forbidden"});
            void queryClient.invalidateQueries({queryKey: authKeys.allMe});
        },
    }),
    mutationCache: new MutationCache({
        onError: (error) => {
            if (isForbidden(error)) void queryClient.invalidateQueries({queryKey: authKeys.allMe});
        },
    }),
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            // Once, and only when it may help: a 4xx (e.g. 403, 404) answers the same again
            retry: (failureCount, error) =>
                failureCount < 1 && !(axios.isAxiosError(error) && (error.response?.status ?? 500) < 500),
            refetchOnWindowFocus: false,
        },
    },
});

// MUI styles are flipped for right-to-left languages by a dedicated emotion cache
const emotionCaches = {
    ltr: createCache({key: "mui"}),
    rtl: createCache({key: "muirtl", stylisPlugins: [prefixer, rtlPlugin]}),
};

export const AppProviders = ({children}: { children: ReactNode }) => {
    const {dir} = useLanguage();
    const theme = useMemo(() => createAppTheme(dir), [dir]);

    return (
        <QueryClientProvider client={queryClient}>
            <CacheProvider value={emotionCaches[dir]}>
                <ThemeProvider theme={theme}>
                    <CssBaseline/>
                    <AuthProvider>{children}</AuthProvider>
                    <Toaster
                        position="bottom-center"
                        toastOptions={{style: {fontFamily: theme.typography.fontFamily, whiteSpace: "pre-line"}}}
                    />
                </ThemeProvider>
            </CacheProvider>
        </QueryClientProvider>
    );
};
