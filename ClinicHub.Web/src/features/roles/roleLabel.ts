import {useCallback} from "react";
import {useTranslation} from "react-i18next";

/** What a role label needs: a `Role` or a staff member's role. */
export type LabeledRole = { name: string; isOwner: boolean };

/**
 * How a role is shown: the Owner role by its translated label (`roles.ownerName`: "Owner" / «المالك»; stored as
 * "Owner"), any other role by its name (clinic data, not translated). The API refuses another role named like either
 * label (`roleNameTaken`), so two roles never look the same.
 */
export const useRoleLabel = () => {
    const {t} = useTranslation();
    return useCallback((role: LabeledRole) => (role.isOwner ? t("roles.ownerName") : role.name), [t]);
};
