import type {KeyboardEventHandler, Ref} from "react";
import {IconButton, InputAdornment, TextField} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import {useTranslation} from "react-i18next";

type Props = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    autoFocus?: boolean;
    inputRef?: Ref<HTMLInputElement>;
    onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
    /** Id of the list this field controls, for screen readers */
    controls?: string;
};

export const SearchField = ({value, onChange, placeholder, autoFocus, inputRef, onKeyDown, controls}: Props) => {
    const {t} = useTranslation();

    return (
        <TextField
            fullWidth
            size="small"
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            inputRef={inputRef}
            onKeyDown={onKeyDown}
            slotProps={{
                input: {
                    startAdornment: (
                        <InputAdornment position="start">
                            <SearchIcon fontSize="small"/>
                        </InputAdornment>
                    ),
                    endAdornment: value ? (
                        <InputAdornment position="end">
                            <IconButton size="small" onClick={() => onChange("")} aria-label={t("common.clear")}>
                                <CloseIcon fontSize="small"/>
                            </IconButton>
                        </InputAdornment>
                    ) : undefined,
                },
                htmlInput: {"aria-controls": controls, "aria-label": placeholder},
            }}
            sx={{"& input[type=search]::-webkit-search-cancel-button": {display: "none"}}}
        />
    );
};
