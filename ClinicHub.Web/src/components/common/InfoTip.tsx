import type {ReactNode} from "react";
import {Box} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {TapTooltip} from "./TapTooltip.tsx";

/** A small ⓘ icon that explains something on hover, focus or tap. */
export const InfoTip = ({title}: { title: ReactNode }) => (
    <TapTooltip title={title} arrow>
        <Box
            component="span"
            tabIndex={0}
            role="img"
            aria-label={typeof title === "string" ? title : undefined}
            sx={{display: "inline-flex", verticalAlign: "middle", color: "text.secondary", cursor: "help", mx: 0.5}}
        >
            <InfoOutlinedIcon sx={{fontSize: 18}}/>
        </Box>
    </TapTooltip>
);
