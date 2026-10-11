import {type ReactNode, useMemo} from "react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {CacheProvider} from "@emotion/react";
import createCache from "@emotion/cache";
import {prefixer} from "stylis";
import rtlPlugin from "@mui/stylis-plugin-rtl";
import {CssBaseline, ThemeProvider} from "@mui/material";
import {Toaster} from "react-hot-toast";
import {createAppTheme} from "./theme.ts";
import {useLanguage} from "../hooks/useLanguage.ts";
import {AuthProvider} from "../features/auth/AuthProvider.tsx";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000,
            retry: 1,
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
