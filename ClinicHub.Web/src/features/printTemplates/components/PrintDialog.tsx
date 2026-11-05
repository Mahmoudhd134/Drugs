import type {ManualInputItem} from "../types.ts";

type Props = {
    /** The template's manual inputs in order; null: closed */
    items: ManualInputItem[] | null;
    /** The values by item id, trimmed */
    onConfirm: (values: Record<string, string>) => void;
    onCancel: () => void;
};

/** The pop-up (contract § 3.3). */
export const PrintDialog: (props: Props) => null = () => null;
