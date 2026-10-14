import type {ReactNode} from "react";
import {Box, Tooltip} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

/** A small ⓘ icon that explains something on hover, focus or tap. */
export const InfoTip = ({title}: { title: ReactNode }) => (
    <Tooltip title={title} enterTouchDelay={0} leaveTouchDelay={5000} arrow>
        <Box
            component="span"
            tabIndex={0}
            role="img"
            aria-label={typeof title === "string" ? title : undefined}
            sx={{display: "inline-flex", verticalAlign: "middle", color: "text.secondary", cursor: "help", mx: 0.5}}
        >
            <InfoOutlinedIcon sx={{fontSize: 18}}/>
        </Box>
    </Tooltip>
);
