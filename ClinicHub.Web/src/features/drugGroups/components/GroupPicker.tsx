import {useState} from "react";
import {Box, Chip, Stack, Typography} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import {useTranslation} from "react-i18next";
import {SearchableList} from "../../../components/common/SearchableList.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {useDrugGroupPicker} from "../api.ts";
import type {DrugGroup} from "../types.ts";

type Props = {
    onSelect: (group: DrugGroup) => void;
    autoFocus?: boolean;
    maxHeight?: number | string;
    /** False: never loads (e.g. no permission to list groups) */
    enabled?: boolean;
};

export const GroupPicker = ({onSelect, autoFocus, maxHeight, enabled = true}: Props) => {
    const {t} = useTranslation();
    const [search, setSearch] = useState("");
    const term = useDebouncedValue(search.trim());
    const query = useDrugGroupPicker(term, {enabled});
    const items = query.data?.pages.flatMap(p => p.items) ?? [];

    return (
        <SearchableList
            search={search}
            onSearchChange={setSearch}
            placeholder={t("groups.searchPlaceholder")}
            items={items}
            getKey={g => g.id}
            onSelect={(group) => {
                onSelect(group);
                setSearch("");
            }}
            renderItem={(group) => (
                <Stack direction="row" sx={{gap: 1.5, width: "100%", alignItems: "flex-start"}}>
                    <Box sx={{flex: 1, minWidth: 0}}>
                        <Stack direction="row" sx={{gap: 1, alignItems: "center", flexWrap: "wrap"}}>
                            <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{group.name}</Typography>
                            <Chip size="small" label={t("groups.drugCount", {count: group.items.length})}/>
                        </Stack>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere"}}
                        >
                            {group.items.map(i => i.drug.name).join(" · ")}
                        </Typography>
                    </Box>
                    <AddIcon color="action" fontSize="small" sx={{mt: 0.5}}/>
                </Stack>
            )}
            totalCount={query.data?.pages[0]?.totalCount}
            isLoading={query.isPending}
            isFetching={query.isFetching}
            isError={query.isError}
            onRetry={() => void query.refetch()}
            hasMore={query.hasNextPage}
            isLoadingMore={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
            // No term and no results = the clinic has no groups (placeholder data is an older term's result)
            emptyText={term || query.isPlaceholderData ? t("groups.noResults") : t("groups.pickerEmpty")}
            autoFocus={autoFocus}
            maxHeight={maxHeight}
        />
    );
};
