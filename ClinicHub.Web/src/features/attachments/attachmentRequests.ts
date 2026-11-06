import type {AxiosProgressEvent, AxiosRequestConfig} from "axios";
import {api} from "../../api/client.ts";
import type {Attachment, AttachmentsAdapter, UploadOptions} from "./types.ts";

/** One request's form: the one part named `file`. A refreshed token's replay re-sends this same `FormData`. */
const formOf = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return form;
};

/**
 * axios strips this header from a `FormData`, so the browser adds it with the boundary. Left with the client's JSON
 * default, the file would be lost and the server would answer `attachmentEmpty`.
 */
const uploadConfig = ({onProgress, signal}: UploadOptions): AxiosRequestConfig => ({
    headers: {"Content-Type": "multipart/form-data"},
    signal,
    onUploadProgress: ({loaded, total}: AxiosProgressEvent) => {
        if (onProgress && total) onProgress(Math.min(100, Math.floor((loaded * 100) / total)));
    },
});

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
    Pick<AttachmentsAdapter, "list" | "upload" | "download"> & Required<Pick<AttachmentsAdapter, "replace" | "delete">> => ({
    list: () => api.get<Attachment[]>(base).then(response => response.data),
    upload: (file, options) => api.post<Attachment>(base, formOf(file), uploadConfig(options)).then(response => response.data),
    replace: (id, file, options) => api.put<Attachment>(`${base}/${id}`, formOf(file), uploadConfig(options)).then(response => response.data),
    delete: id => api.delete(`${base}/${id}`).then(() => undefined),
    download: (id, signal) => api.get<Blob>(`${base}/${id}`, {responseType: "blob", signal}).then(response => response.data),
});
