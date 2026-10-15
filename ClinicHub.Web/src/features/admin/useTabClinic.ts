import {useOutletContext} from "react-router-dom";
import type {ClinicDetails} from "./types.ts";

/** The clinic the page loaded, inside a tab of `CLINIC_TABS` (the clinic page gives it to its outlet). */
export const useTabClinic = () => useOutletContext<ClinicDetails>();
