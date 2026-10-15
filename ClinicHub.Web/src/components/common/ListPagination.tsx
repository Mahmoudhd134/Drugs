import {TablePagination} from "@mui/material";
import {useTranslation} from "react-i18next";
import {PAGE_SIZES} from "./pageSizes.ts";

type Props = {
    count: number;
    /** 0-based */
    page: number;
    onPageChange: (page: number) => void;
    rowsPerPage: number;
    onRowsPerPageChange: (rowsPerPage: number) => void;
};

/**
 * The paging bar under a table, translated. On a phone the rows-per-page choice is hidden (the default size is kept),
 * so the bar fits the screen.
 */
export const ListPagination = ({count, page, onPageChange, rowsPerPage, onRowsPerPageChange}: Props) => {
    const {t} = useTranslation();
    return (
        <TablePagination
            component="div"
            count={count}
            page={page}
            onPageChange={(_, p) => onPageChange(p)}
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={PAGE_SIZES}
            onRowsPerPageChange={(e) => onRowsPerPageChange(Number(e.target.value))}
            labelRowsPerPage={t("common.rowsPerPage")}
            labelDisplayedRows={({from, to, count}) => t("common.displayedRows", {from, to, count})}
            getItemAriaLabel={(type) => t(`common.pagination.${type}`)}
            sx={{
                "& .MuiTablePagination-selectLabel, & .MuiTablePagination-input": {display: {xs: "none", sm: "inline-flex"}},
                "& .MuiTablePagination-toolbar": {px: {xs: 1, sm: 2}},
            }}
        />
    );
};
