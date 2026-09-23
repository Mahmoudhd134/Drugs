import {useState} from "react";
import {Modal, Box, Button} from "@mui/material";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import toast from "react-hot-toast";
import type {Drag} from "../../../typs/drag.ts";

type Props = {
    drags: Drag[];
};

export const EditAndCopyModal = ({drags}: Props) => {
    const [open, setOpen] = useState(false);
    const [text, setText] = useState("");

    const handleOpen = () => {
        // Generate HTML with proper line breaks
        const initialHtml = drags
            .map(d => {
                const parts = [];
                if (d.name) parts.push(`<strong>${d.name}</strong>`);
                if (d.description) parts.push(d.description);
                return `<p>${parts.join('<br>')}</p>`;
            })
            .join("<p><br></p>"); // Empty paragraph for spacing

        setText(initialHtml);
        setOpen(true);
    };

    const handleClose = () => setOpen(false);

    const handleCopy = () => {
        // Replace <p> tags with newlines, <br> with newlines
        let plainText = text
            .replace(/<\/p>/gi, '\n')
            .replace(/<p>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<strong>(.*?)<\/strong>/gi, '$1')
            .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/\n\s*\n\s*\n/g, '\n\n') // Max 2 consecutive newlines
            .trim();

        navigator.clipboard.writeText(plainText);
        toast.success("Copied!");
    };

    return (
        <>
            <Button variant="contained" color="primary" onClick={handleOpen} sx={{mt: 2}}>
                Edit & Copy
            </Button>

            <Modal open={open} onClose={handleClose}>
                <Box
                    sx={{
                        position: "absolute" as const,
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        bgcolor: "background.paper",
                        boxShadow: 24,
                        borderRadius: 2,
                        p: 4,
                        width: 800,
                        maxHeight: "80vh",
                        maxWidth: "90vw",
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    <Box sx={{display: "flex", justifyContent: "flex-end", mb: 2}}>
                        <Button
                            variant="outlined"
                            onClick={handleCopy}
                        >
                            Copy
                        </Button>
                    </Box>

                    <Box sx={{height: "400px", mb: 2}}>
                        <ReactQuill
                            theme="snow"
                            value={text}
                            onChange={setText}
                            style={{height: "90%"}}
                            modules={{
                                toolbar: [
                                    ['bold', 'italic', 'underline'],
                                    [{'list': 'ordered'}, {'list': 'bullet'}],
                                    ['clean']
                                ]
                            }}
                        />
                    </Box>
                </Box>
            </Modal>
        </>
    );
};