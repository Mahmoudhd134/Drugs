import {Component, type ReactNode, Suspense} from "react";
import {useLocation} from "react-router-dom";
import {Button} from "@mui/material";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import {useTranslation} from "react-i18next";
import {EmptyState} from "./EmptyState.tsx";
import {FullPageSpinner} from "./FullPageSpinner.tsx";

/**
 * Where a layout shows its page: a spinner while the page's chunk loads, and "Couldn't load — Reload" instead of a
 * blank app when it fails (API down, or a new version deployed meanwhile: see `app/chunkReload.ts`) or the page
 * crashes. Opening another page tries again.
 */
export const PageBoundary = ({children}: { children: ReactNode }) => {
    const {pathname} = useLocation();
    return (
        <ErrorBoundary resetKey={pathname} fallback={<PageFailed/>}>
            <Suspense fallback={<FullPageSpinner/>}>{children}</Suspense>
        </ErrorBoundary>
    );
};

const PageFailed = () => {
    const {t} = useTranslation();
    return (
        <EmptyState
            icon={<ErrorOutlineIcon/>}
            title={t("common.pageFailed")}
            description={t("common.pageFailedHint")}
            action={<Button variant="contained" onClick={() => window.location.reload()}>{t("common.reload")}</Button>}
        />
    );
};

type BoundaryProps = { resetKey: string; fallback: ReactNode; children: ReactNode };

class ErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
    state = {failed: false};

    static getDerivedStateFromError() {
        return {failed: true};
    }

    componentDidUpdate(previous: BoundaryProps) {
        if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({failed: false});
    }

    render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
