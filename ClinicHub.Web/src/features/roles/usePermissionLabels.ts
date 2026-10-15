import {useTranslation} from "react-i18next";

/** Translated labels of the permission catalog; a key without a label (newer API than the SPA) shows as it is. */
export const usePermissionLabels = () => {
    const {t, i18n} = useTranslation();
    const label = (key: string, fallback: string) => (i18n.exists(key) ? t(key) : fallback);
    return {
        module: (module: string) => label(`permissionModules.${module}`, module),
        resource: (resource: string) => label(`permissionResources.${resource}`, resource),
        permission: (key: string) => label(`permissions.${key}`, key),
    };
};
