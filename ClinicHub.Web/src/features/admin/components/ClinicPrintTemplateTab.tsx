import {useMemo} from "react";
import {TemplateDesigner} from "../../printTemplates/components/TemplateDesigner.tsx";
import {adminPrintTemplateApi} from "../adapters.ts";
import {useTabClinic} from "../useTabClinic.ts";

/** The clinic page's Print template tab. */
export const ClinicPrintTemplateTab = () => {
    const {id} = useTabClinic();
    const adapter = useMemo(() => adminPrintTemplateApi(id), [id]);
    return <TemplateDesigner adapter={adapter}/>;
};
