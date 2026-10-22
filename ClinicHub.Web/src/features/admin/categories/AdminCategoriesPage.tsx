import {Box} from "@mui/material";
import {useTranslation} from "react-i18next";
import {PageHeader} from "../../../components/common/PageHeader.tsx";

/**
 * `/admin/categories` (design M1.7 D9). M1.7b contract stub (track `web`); screen structure in
 * docs/design/m1.7b-contract.md "Admin categories page".
 */
export const AdminCategoriesPage = () => {
    const {t} = useTranslation();
    return <Box><PageHeader title={t("adminCategories.title")}/></Box>;
};
