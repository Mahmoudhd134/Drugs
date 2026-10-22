import {Box} from "@mui/material";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";

/**
 * `/admin/drugs` (design M1.7 D9): the shared catalog. M1.7b contract stub (track `web`); screen structure in
 * docs/design/m1.7b-contract.md "Admin drugs page".
 */
export const AdminDrugsPage = () => {
    const {t} = useTranslation();
    return <Box><PageHeader title={t("adminDrugs.title")}/></Box>;
};
