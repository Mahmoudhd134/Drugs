import {useState} from "react";
import {Button, ListItemIcon, ListItemText, Menu, MenuItem} from "@mui/material";
import TranslateIcon from "@mui/icons-material/Translate";
import CheckIcon from "@mui/icons-material/Check";
import {useTranslation} from "react-i18next";
import {LANGUAGES} from "../../i18n/languages.ts";
import {useLanguage} from "../../hooks/useLanguage.ts";

export const LanguageMenu = () => {
    const {t} = useTranslation();
    const {language, setLanguage} = useLanguage();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const current = LANGUAGES.find(l => l.code === language);

    return (
        <>
            <Button
                color="inherit"
                startIcon={<TranslateIcon/>}
                onClick={(e) => setAnchor(e.currentTarget)}
                aria-label={t("nav.language")}
            >
                {current?.label}
            </Button>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
                {LANGUAGES.map(l => (
                    <MenuItem
                        key={l.code}
                        selected={l.code === language}
                        lang={l.code}
                        onClick={() => {
                            void setLanguage(l.code);
                            setAnchor(null);
                        }}
                    >
                        <ListItemIcon>{l.code === language && <CheckIcon fontSize="small"/>}</ListItemIcon>
                        <ListItemText>{l.label}</ListItemText>
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
};
