import {Box, Typography} from "@mui/material";
import type {Drug} from "../types.ts";
import {DosingText} from "../../dosing/components/DosingText.tsx";

type Props = {
    drug: Pick<Drug, "name" | "description" | "defaultDosing">;
    /** Clamp the description to this many lines */
    descriptionLines?: number;
    /** Also show the default dosing sentence */
    showDosing?: boolean;
};

/** Drug name with its description underneath. */
export const DrugText = ({drug, descriptionLines, showDosing}: Props) => (
    <Box sx={{minWidth: 0}}>
        <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{drug.name}</Typography>
        {showDosing && <DosingText dosing={drug.defaultDosing}/>}
        {drug.description && (
            <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                    whiteSpace: "pre-line",
                    overflowWrap: "anywhere",
                    ...(descriptionLines && {
                        display: "-webkit-box",
                        WebkitLineClamp: descriptionLines,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                    }),
                }}
            >
                {drug.description}
            </Typography>
        )}
    </Box>
);
