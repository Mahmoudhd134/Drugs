import {type Ref, useImperativeHandle, useLayoutEffect, useRef} from "react";
import Quill, {type StringMap} from "quill";
import "quill/dist/quill.snow.css";

export type QuillEditorHandle = { getEditor: () => Quill };

type QuillEditorProps = {
    /** The editor's HTML. */
    value: string;
    /** Called with the editor's HTML after each change that makes it differ from the last value. */
    onChange: (html: string) => void;
    /** Read once, when Quill is created. */
    modules: StringMap;
    /** Read once, when Quill is created. */
    theme: string;
    ref?: Ref<QuillEditorHandle>;
};

/**
 * A Quill 1 editor that behaves like react-quill 2 did (it used `findDOMNode`, gone in React 19): Quill is created once
 * on the editing area, `value` is pasted into it on mount and whenever it differs from the editor's last HTML, and every
 * text change (any source, as react-quill's `editor-change` listener) reports `root.innerHTML` through `onChange` when it
 * differs from that last HTML.
 */
export const QuillEditor = ({value, onChange, modules, theme, ref}: QuillEditorProps) => {
    const areaRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Quill | null>(null);
    /** The editor's HTML as last pasted in or reported. */
    const htmlRef = useRef(value);
    const onChangeRef = useRef(onChange);

    useImperativeHandle(ref, () => ({
        getEditor: () => {
            if (!editorRef.current) throw new Error("Accessing non-instantiated editor");
            return editorRef.current;
        },
    }), []);

    useLayoutEffect(() => {
        onChangeRef.current = onChange;
    });

    // A value from outside (not the one the editor just reported) replaces the editor's content
    useLayoutEffect(() => {
        const editor = editorRef.current;
        if (!editor || value === htmlRef.current) return;
        htmlRef.current = value;
        editor.setContents(editor.clipboard.convert(value));
    }, [value]);

    useLayoutEffect(() => {
        // Created once and kept (also across Strict Mode's remount), like react-quill
        const editor = editorRef.current ??= new Quill(areaRef.current!, {modules, theme});
        const onEditorChange = (eventName: string) => {
            if (eventName !== "text-change") return;
            const html = editor.root.innerHTML;
            if (html === htmlRef.current) return;
            htmlRef.current = html;
            onChangeRef.current(html);
        };
        editor.on("editor-change", onEditorChange);
        editor.setContents(editor.clipboard.convert(htmlRef.current));
        return () => void editor.off("editor-change", onEditorChange);
        // modules and theme are read once (react-quill rebuilt Quill when they changed; they are constants here)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="quill">
            <div ref={areaRef}/>
        </div>
    );
};
