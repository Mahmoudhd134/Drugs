# Prescription builder: technical

## Summary
The home page (`/`). Staff add groups or single drugs to a selection, reorder it, then copy it
(plain text + HTML for Word), optionally after editing in a rich-text editor. **Frontend only**:
nothing is saved on the server; the selection lives in `localStorage`.

## Data model / API
None of its own. Reads drugs and groups through the existing endpoints (`GET /drugs`,
`GET /drug-groups`) via `DrugPicker` and `GroupPicker`.

## Frontend (`src/features/prescription/`)

### State: `usePrescriptionSelection.ts`
- `drugs: Drug[]` persisted to `localStorage["prescription.selection"]` (JSON) on every change;
  storage errors are ignored.
- `add(drugs)`: appends only drugs not already selected (and de-duplicates the input); returns
  `{ added, skipped }` for the toast.
- `remove(drug)`, `reorder(drugs)`, `clear()`: `clear` returns a `restore` function for undo.
- `selectedIds: Set<number>` for "Added" markers.

### Page & components
- `pages/PrescriptionPage.tsx`: two columns (catalog md=5, selection md=7; stacked on mobile).
  - Adding a group → toast `prescription.groupAdded` (+ `groupSkipped` when some were already
    selected). Adding an already-selected drug → toast `prescription.alreadyAdded`.
  - Clear all → toast with an **Undo** button (6 s).
  - **Copy** button → `copyRichText(htmlForPaste(drugsToHtml(drugs, dir)), drugsToPlainText(drugs))`.
- `components/CatalogPanel.tsx`: tabs **Groups** (default) / **Drugs**; both pickers stay mounted
  so each keeps its search. `GroupPicker` autofocuses.
- `components/SelectionPanel.tsx`: count chip, Clear all, `SelectedDrugsList` (drag to reorder,
  remove), empty state, buttons **Copy** and **Edit & copy**.
- `components/EditorDialog.tsx` + `EditorContent.tsx`: the Quill editor is **lazy-loaded**
  (`React.lazy`) the first time the dialog opens. The dialog unmounts its content on close, so the
  editor is rebuilt from the current selection on every open. Toolbar: bold/italic/underline,
  ordered/bullet list, direction RTL, align, clean. Edits are not saved.

### Text formats (`prescriptionText.ts`)
- `drugsToPlainText`: `name\ndescription`, blank line between drugs.
- `drugsToHtml(drugs, dir)`: one `<p>` per drug: `<strong>name</strong><br>description`
  (HTML-escaped, newlines → `<br>`), separated by empty paragraphs. When the UI is RTL each
  paragraph gets Quill's `ql-direction-rtl ql-align-right` classes.
- `htmlToPlainText(html)`: DOM-based conversion of editor HTML; keeps line breaks, numbers ordered
  lists (`1.`), bullets unordered lists (`•`), collapses 3+ newlines to 2.
- `htmlForPaste(html)`: makes HTML self-contained for Word: Quill classes →
  inline styles (`text-align`, `dir="rtl"`, indent → `margin-left/right: N*3em`) and paragraph
  margins set to 0 so spacing matches the editor.

### Clipboard (`src/utils/clipboard.ts`)
- `copyRichText(html, text)`: in a secure context uses `navigator.clipboard.write` with
  `text/html` + `text/plain`; otherwise (plain-http LAN) falls back to a `copy` event listener +
  `document.execCommand("copy")` that sets both formats. Returns `false` on failure → toast
  `errors.copyFailed`.
- `copyText(text)`: plain-text equivalent (currently unused by the UI).

## Edge cases & limitations
- The stored selection keeps a **snapshot** of drug text; edits/deletes of drugs afterwards are not
  reflected until the drug is removed and re-added.
- Selection is per browser (not per user or patient) and is not saved as a history.
- Windows 11 Notepad ignores the HTML clipboard format, so it receives plain text only. Word keeps
  formatting.
- The execCommand fallback requires a real user click (it runs synchronously in the click handler
  on non-secure origins).

## Testing notes
Verified in the browser: group overlap de-duplication toast, RTL editor paragraphs, copied HTML
and plain text captured from both the secure path and the simulated plain-http fallback.
