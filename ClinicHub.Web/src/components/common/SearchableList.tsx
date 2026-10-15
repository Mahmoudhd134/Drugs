import {type ReactNode, useEffect, useId, useRef, useState} from "react";
import {Alert, Box, Button, CircularProgress, LinearProgress, List, ListItemButton, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {SearchField} from "./SearchField.tsx";

type Props<T> = {
    search: string;
    onSearchChange: (value: string) => void;
    placeholder: string;
    items: T[];
    getKey: (item: T) => string | number;
    renderItem: (item: T) => ReactNode;
    onSelect: (item: T) => void;
    totalCount?: number;
    isLoading: boolean;
    isFetching?: boolean;
    isError: boolean;
    onRetry: () => void;
    hasMore?: boolean;
    isLoadingMore?: boolean;
    onLoadMore?: () => void;
    emptyText: string;
    autoFocus?: boolean;
    maxHeight?: number | string;
};

/**
 * Search box + result list with keyboard support:
 * ↑/↓ move the highlight, Enter selects, Escape clears the search. A double click on an item selects it once.
 */
export const SearchableList = <T, >(props: Props<T>) => {
    const {
        search, onSearchChange, placeholder, items, getKey, renderItem, onSelect, totalCount,
        isLoading, isFetching, isError, onRetry, hasMore, isLoadingMore, onLoadMore, emptyText,
        autoFocus, maxHeight = "60vh",
    } = props;
    const {t} = useTranslation();
    const listId = useId();
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);

    // Reset the highlight when the results change
    useEffect(() => setActiveIndex(0), [search]);

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({block: "nearest"});
    }, [activeIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex(i => Math.min(i + 1, items.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex(i => Math.max(i - 1, 0));
        } else if (e.key === "Enter" && items[activeIndex]) {
            e.preventDefault();
            onSelect(items[activeIndex]);
        } else if (e.key === "Escape" && search) {
            onSearchChange("");
        }
    };

    return (
        <Box>
            <SearchField
                value={search}
                onChange={onSearchChange}
                placeholder={placeholder}
                autoFocus={autoFocus}
                onKeyDown={handleKeyDown}
                controls={listId}
            />

            <Box sx={{height: 4, mt: 1}}>
                {isFetching && !isLoading && <LinearProgress sx={{borderRadius: 1}}/>}
            </Box>

            {totalCount !== undefined && !isLoading && !isError && items.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{display: "block", mb: 0.5, px: 0.5}}>
                    {t("common.results", {count: totalCount})}
                </Typography>
            )}

            {isLoading ? (
                <Box sx={{display: "flex", justifyContent: "center", py: 4}}>
                    <CircularProgress size={28}/>
                </Box>
            ) : isError ? (
                <Alert
                    severity="error"
                    action={<Button color="inherit" size="small" onClick={onRetry}>{t("common.retry")}</Button>}
                >
                    {t("common.loadFailed")}
                </Alert>
            ) : items.length === 0 ? (
                <Typography color="text.secondary" sx={{textAlign: "center", py: 4}}>{emptyText}</Typography>
            ) : (
                <Box sx={{maxHeight, overflowY: "auto", border: 1, borderColor: "divider", borderRadius: 2}}>
                    <List id={listId} ref={listRef} disablePadding role="listbox">
                        {items.map((item, index) => (
                            <ListItemButton
                                key={getKey(item)}
                                data-index={index}
                                role="option"
                                selected={index === activeIndex}
                                aria-selected={index === activeIndex}
                                // Only the first click of a burst: a double click selects once (keyboard activation has detail 0)
                                onClick={(event) => event.detail <= 1 && onSelect(item)}
                                onMouseEnter={() => setActiveIndex(index)}
                                divider={index < items.length - 1}
                                sx={{alignItems: "flex-start", py: 1.25}}
                            >
                                {renderItem(item)}
                            </ListItemButton>
                        ))}
                    </List>
                    {hasMore && onLoadMore && (
                        <Box sx={{p: 1, textAlign: "center", borderTop: 1, borderColor: "divider"}}>
                            <Button size="small" onClick={onLoadMore} disabled={isLoadingMore}>
                                {isLoadingMore ? <CircularProgress size={18}/> : t("common.loadMore")}
                            </Button>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
};
