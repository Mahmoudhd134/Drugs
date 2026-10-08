import {Box, Typography} from "@mui/material";
import type {Drug} from "../types.ts";

type Props = {
    drug: Pick<Drug, "name" | "description">;
    /** Clamp the description to this many lines */
    descriptionLines?: number;
};

/** Drug name with its description underneath. */
export const DrugText = ({drug, descriptionLines}: Props) => (
    <Box sx={{minWidth: 0}}>
        <Typography sx={{fontWeight: 600, overflowWrap: "anywhere"}}>{drug.name}</Typography>
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
