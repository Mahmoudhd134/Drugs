import {Box, CircularProgress} from "@mui/material";

/** Centered spinner for a page (or lazy chunk) that is loading. */
export const FullPageSpinner = () => (
    <Box sx={{display: "flex", justifyContent: "center", alignItems: "center", minHeight: "40vh"}}>
        <CircularProgress/>
    </Box>
);
