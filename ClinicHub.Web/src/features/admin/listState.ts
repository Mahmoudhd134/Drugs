import {useLocation} from "react-router-dom";

/** Navigation state from the clinics list to a clinic: the list's URL query (search, status filter, page). */
export type ClinicsListState = { listSearch?: string };

/** Where Back leads from a clinic: the clinics list as it was left, else its first page. */
export const useClinicsListPath = () => {
    const location = useLocation();
    const listSearch = (location.state as ClinicsListState | null)?.listSearch;
    return listSearch ? `/admin?${listSearch}` : "/admin";
};
