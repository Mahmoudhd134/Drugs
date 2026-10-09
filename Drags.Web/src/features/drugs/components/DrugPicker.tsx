import {useState} from "react";
import {Box, Chip, Stack} from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import {useTranslation} from "react-i18next";
import {SearchableList} from "../../../components/common/SearchableList.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {useDrugPicker} from "../api.ts";
import {DrugText} from "./DrugText.tsx";
import type {Drug} from "../types.ts";

type Props = {
    onSelect: (drug: Drug) => void;
    /** Drugs already chosen; they are marked as added */
    selectedIds?: ReadonlySet<number>;
    autoFocus?: boolean;
    maxHeight?: number | string;
};

export const DrugPicker = ({onSelect, selectedIds, autoFocus, maxHeight}: Props) => {
    const {t} = useTranslation();
    const [search, setSearch] = useState("");
    const query = useDrugPicker(useDebouncedValue(search.trim()));
    const items = query.data?.pages.flatMap(p => p.items) ?? [];

    return (
        <SearchableList
            search={search}
            onSearchChange={setSearch}
            placeholder={t("drugs.searchPlaceholder")}
            items={items}
            getKey={d => d.id}
            onSelect={(drug) => {
                onSelect(drug);
                setSearch("");
            }}
            renderItem={(drug) => {
                const added = selectedIds?.has(drug.id);
                return (
                    <Stack direction="row" sx={{gap: 1.5, width: "100%", alignItems: "flex-start"}}>
                        <Box sx={{flex: 1, minWidth: 0}}>
                            <DrugText drug={drug} descriptionLines={2} showDosing/>
                        </Box>
                        {added
                            ? <Chip size="small" color="success" variant="outlined" icon={<CheckIcon/>} label={t("common.added")}/>
                            : <AddIcon color="action" fontSize="small" sx={{mt: 0.5}}/>}
                    </Stack>
                );
            }}
            totalCount={query.data?.pages[0]?.totalCount}
            isLoading={query.isPending}
            isFetching={query.isFetching}
            isError={query.isError}
            onRetry={() => void query.refetch()}
            hasMore={query.hasNextPage}
            isLoadingMore={query.isFetchingNextPage}
            onLoadMore={() => void query.fetchNextPage()}
            emptyText={t("drugs.noResults")}
            autoFocus={autoFocus}
            maxHeight={maxHeight}
        />
    );
};
