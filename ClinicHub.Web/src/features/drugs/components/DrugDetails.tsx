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
            <Typography sx={{fontWeight: 600, ...wrap}} dir="auto">{drug.name}</Typography>
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
