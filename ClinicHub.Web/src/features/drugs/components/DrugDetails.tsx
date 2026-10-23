import {Stack, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {categoryPath} from "../categories.ts";
import type {Drug} from "../types.ts";
import {DosingText} from "../../dosing/components/DosingText.tsx";

type Props = {
    drug: Pick<Drug, "name" | "activeIngredients" | "description" | "defaultDosing" | "category" | "subCategory">;
};

/**
 * A drug's read-only details (design M1.7 D9): name, active ingredients, «التصنيف: … › …», description, and the
 * default dosing of an own drug (a shared drug has none). Rows with nothing are left out; long text wraps.
 */
export const DrugDetails = ({drug}: Props) => {
    const {t, i18n} = useTranslation();
    const wrap = {overflowWrap: "anywhere"} as const;
    return (
        <Stack sx={{gap: 1, minWidth: 0}}>
            {/* The name isolated in its own direction (a `<bdi>` line), aligned to the interface's start side: `left` is
                flipped to `right` in Arabic by the RTL style cache (M1.7b D27, M1.7c C37) */}
            <Typography component="bdi" sx={{display: "block", textAlign: "left", fontWeight: 600, ...wrap}}>{drug.name}</Typography>
            {drug.activeIngredients?.trim() && (
                <Typography variant="body2" sx={wrap}>
                    {t("drugs.activeIngredients")}: <bdi dir="auto">{drug.activeIngredients}</bdi>
                </Typography>
            )}
            {drug.category && (
                <Typography variant="body2" sx={wrap}>
                    {t("drugs.categoryLine", {path: categoryPath(drug.category, drug.subCategory, i18n.language, t)})}
                </Typography>
            )}
            {drug.description?.trim() && (
                <Typography variant="body2" color="text.secondary" dir="auto" sx={{whiteSpace: "pre-line", ...wrap}}>
                    {drug.description}
                </Typography>
            )}
            <DosingText dosing={drug.defaultDosing}/>
        </Stack>
    );
};
