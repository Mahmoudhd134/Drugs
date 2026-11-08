/*
 * The forms API (design dynamic-forms § 4.3), `/admin/forms`: the super admin's platform forms.
 */

export type FormDirection = "ltr" | "rtl";

/**
 * The definition's outer shape only (design § 5.2). The server stores any JSON object and never reads inside it (D4), so a
 * saved one may not match this: the builder narrows `nodes` and handles what it can't read.
 */
export type FormDefinition = {
    schemaVersion: number;
    dir: FormDirection;
    nodes: unknown[];
};

export type FormSummary = {
    id: number;
    name: string;
    activeVersionNumber: number;
    /** ISO UTC: the form's last save */
    updatedAt: string;
};

export type FormDetails = FormSummary & {
    /** The active version's definition, as saved: any JSON object (D4), so read it before trusting its shape */
    definition: Record<string, unknown>;
};

/** The body of `POST /admin/forms` and `PUT /admin/forms/:id`. */
export type SaveForm = {
    name: string;
    definition: FormDefinition;
};
