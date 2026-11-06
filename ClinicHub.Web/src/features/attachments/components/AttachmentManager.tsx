import {Stack} from "@mui/material";
import type {AttachmentManagerProps} from "../types.ts";
import {useAttachments} from "../useAttachments.ts";
import {AttachmentList} from "./AttachmentList.tsx";
import {AttachmentPicker} from "./AttachmentPicker.tsx";
import {AttachmentPreview} from "./AttachmentPreview.tsx";

/** Picker, list and preview on one `useAttachments`: the common case. */
export const AttachmentManager = ({
    adapter,
    multiple,
    maxFiles,
    canUpload,
    canReplace,
    canDelete,
    renderTrigger,
    renderSelectedItem,
    renderItem,
    renderEmpty,
    renderPreview,
}: AttachmentManagerProps) => {
    const files = useAttachments({adapter, multiple, maxFiles, canReplace});
    return (
        <Stack sx={{gap: 2}}>
            <AttachmentPicker
                files={files}
                canUpload={canUpload}
                canReplace={canReplace}
                showListState={false}
                renderTrigger={renderTrigger}
                renderSelectedItem={renderSelectedItem}
            />
            <AttachmentList
                files={files}
                canReplace={canReplace}
                canDelete={canDelete}
                renderItem={renderItem}
                renderEmpty={renderEmpty}
            />
            <AttachmentPreview files={files} renderPreview={renderPreview}/>
        </Stack>
    );
};
