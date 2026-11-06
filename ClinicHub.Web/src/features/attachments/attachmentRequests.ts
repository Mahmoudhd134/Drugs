import type {AttachmentsAdapter} from "./types.ts";

/**
 * An adapter's calls on a feature's routes, so no feature repeats the multipart and blob details. `base` is relative to
 * the API's base, like `/admin/clinics/3/paper-image`. The feature adds `rules`, `scope`, `affects` and `container`.
 *
 * | Call | Request |
 * |---|---|
 * | `list` | `GET {base}` |
 * | `upload` | `POST {base}`, multipart, the one part named `file` |
 * | `replace` | `PUT {base}/{id}`, multipart, the one part named `file` |
 * | `delete` | `DELETE {base}/{id}` |
 * | `download` | `GET {base}/{id}`, `responseType: "blob"` |
 *
 * A feature whose routes differ writes that call itself (a single paper image has no list of IDs).
 */
export const attachmentRequests = (base: string):
    Pick<AttachmentsAdapter, "list" | "upload" | "download"> & Required<Pick<AttachmentsAdapter, "replace" | "delete">> => {
    throw new Error(`Attachments contract stub, built in T1 (base ${base})`);
};
