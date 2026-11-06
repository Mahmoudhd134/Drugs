import {useMemo} from "react";
import {TemplateDesigner} from "../../printTemplates/components/TemplateDesigner.tsx";
import {adminPaperImageApi, adminPrintTemplateApi} from "../adapters.ts";
import {useTabClinic} from "../useTabClinic.ts";

/** The clinic page's Print template tab. `key`: a new clinic mounts everything anew, part 2's selection and queue included (step 4 contract § 4.5). */
export const ClinicPrintTemplateTab = () => {
    const {id} = useTabClinic();
    const adapter = useMemo(() => adminPrintTemplateApi(id), [id]);
    const paperAdapter = useMemo(() => adminPaperImageApi(id), [id]);
    return <TemplateDesigner key={id} adapter={adapter} paperAdapter={paperAdapter}/>;
};
