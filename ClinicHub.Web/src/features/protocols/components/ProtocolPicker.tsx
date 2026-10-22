import {useState} from "react";
import {Box, Chip, Stack, Typography} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import {useTranslation} from "react-i18next";
import {SearchableList} from "../../../components/common/SearchableList.tsx";
import {useDebouncedValue} from "../../../hooks/useDebouncedValue.ts";
import {useProtocolPicker} from "../api.ts";
import type {Protocol} from "../types.ts";
import {WithdrawnChip} from "../../drugs/components/WithdrawnChip.tsx";
import {WithdrawnChipInsideControl} from "../../drugs/components/withdrawnChipContext.ts";

type Props = {
    onSelect: (protocol: Protocol) => void;
    autoFocus?: boolean;
    maxHeight?: number | string;
    /** False: never loads (e.g. no permission to list protocols) */
    enabled?: boolean;
};

export const ProtocolPicker = ({onSelect, autoFocus, maxHeight, enabled = true}: Props) => {
    const {t} = useTranslation();
    const [search, setSearch] = useState("");
    const term = useDebouncedValue(search.trim());
    const query = useProtocolPicker(term, {enabled});
    const items = query.data?.pages.flatMap(p => p.items) ?? [];

    return (
        <SearchableList
            search={search}
            onSearchChange={setSearch}
            placeholder={t("protocols.searchPlaceholder")}
            items={items}
            getKey={g => g.id}
            onSelect={(protocol) => {
                onSelect(protocol);
                setSearch("");
            }}
            renderItem={(protocol) => (
                <Stack direction="row" sx={{gap: 1.5, width: "100%", alignItems: "flex-start"}}>
                    <Box sx={{flex: 1, minWidth: 0}}>
                        <Stack direction="row" sx={{gap: 1, alignItems: "center", flexWrap: "wrap"}}>
                            <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{protocol.name}</Typography>
                            <Chip size="small" label={t("protocols.drugCount", {count: protocol.items.length})}/>
                            {protocol.items.some(i => i.drug.withdrawn) && (
                                // Inside the option (itself the control): not a Tab stop of its own
                                <WithdrawnChipInsideControl.Provider value>
                                    <WithdrawnChip count={protocol.items.filter(i => i.drug.withdrawn).length}/>
                                </WithdrawnChipInsideControl.Provider>
                            )}
                        </Stack>
                        <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere"}}
                        >
                            {protocol.items.map(i => i.drug.name).join(" · ")}
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
            // No term and no results = the clinic has no protocols (placeholder data is an older term's result)
            emptyText={term || query.isPlaceholderData ? t("protocols.noResults") : t("protocols.pickerEmpty")}
            autoFocus={autoFocus}
            maxHeight={maxHeight}
        />
    );
};
