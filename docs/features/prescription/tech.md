# Prescription builder: technical

## Summary
The home page (`/`). Staff add groups or single drugs as **prescription lines**, adjust each
line's dosing for the patient, reorder, then copy (plain text + HTML for Word), optionally after
editing in a rich-text editor. **Frontend only**: nothing is saved on the server; the lines live in
`localStorage`.

## Data model / API
None of its own. Reads drugs and groups through the existing endpoints (`GET /drugs`,
`GET /drug-groups`) via `DrugPicker` and `GroupPicker`.

`PrescriptionLine` (`features/prescription/types.ts`):

| Field | Meaning |
|---|---|
| `key` | unique line id (`Date.now` + random; `crypto.randomUUID` is unavailable on plain http) |
| `drug` | snapshot of the drug when added (`id`, `name`, `description`, `defaultDosing`) |
| `dosing` | starts as a copy of `drug.defaultDosing`, edited per patient (see [dosing](../dosing/tech.md)) |
| `note` | free text for this patient |

**Rule:** a drug appears at most **once per eye** (identity = `drugId + (eye ?? "none")`).

## Frontend (`src/features/prescription/`)

### State: `usePrescriptionLines.ts`
- Persisted to `localStorage["prescription.lines"]` on every change; storage errors are ignored.
- **Legacy migration:** if only the old key `prescription.selection` (array of drugs) exists, each
  drug becomes a line with its default dosing. The new key is written **before** the old key is
  removed, because React may call the state initializer twice.
- `addDrugs(drugs)`: one line per drug with its default dosing; skips drug+eye pairs already
  present (also within the batch). Returns `{ added, skipped }`.
- `updateLine(key, {dosing, note})`: returns `false` (no change) if the new eye clashes with another
  line of the same drug.
- `canAddOtherEye(line)` / `addOtherEye(line)`: for right/left lines whose opposite eye is free,
  inserts a copy for the other eye right after the line.
- `removeLine(key)`, `reorder(lines)`, `clear()` (returns a `restore` function for undo).
- `findLine(drugId, dosing)`, `addLines(lines)`, `setLineDosing(key, dosing)`: used by the
  add-group flow. `newLine(drug, dosing?)` and `lineIdentity(drugId, dosing)` are exported.
- `drugIds: Set<number>` for "Added" markers in the drug picker.

### Page & components
- `pages/PrescriptionPage.tsx`: two columns (catalog md=5, lines md=7; stacked on mobile).
  - **Adding a group** (`addGroup`):
    1. Each group line → candidate with `mergeDosing(drug.defaultDosing, line.dosing)`.
    2. If any candidate eye is `ask` → `askEye(groupName)` (right / left / both). Cancel aborts.
    3. For each candidate (drug+eye seen twice in the batch: first wins): no existing line →
       new line; existing with the same dosing (`sameDosing`) → counted as unchanged;
       otherwise → conflict.
    4. Conflicts are asked one by one with `askConflict` (current vs group sentence; "keep
       current" / "use the group's"; closing = keep). With more conflicts left, a checkbox applies
       the answer to the rest. "Use the group's" replaces the existing line's dosing in place
       (position and note kept).
    5. New lines are appended; toast lines `groupAdded`, `groupReplaced`, `groupKept`,
       `groupSkipped` (identical).
  - Adding a single drug whose drug+eye is already present → toast `prescription.alreadyAdded`.
  - Clear all → toast with **Undo** (6 s).
  - **Copy** → `copyRichText(htmlForPaste(linesToHtml(lines)), linesToPlainText(lines))`.
- `components/CatalogPanel.tsx`: tabs **Groups** (default) / **Drugs**; both pickers stay mounted.
- `components/SelectionPanel.tsx`: count chip, Clear all, `PrescriptionLineList`, empty state,
  **Copy** and **Edit & copy** buttons.
- `components/PrescriptionLineList.tsx`: `DosingLineList` rows: number, drug name, Arabic dosing
  sentence (or the drug description when the line has no dosing), note; actions ✎ edit,
  ⊕ add for the other eye (only when possible), ✕ remove. Clicking the row text also edits.
- `components/useGroupAddDialogs.tsx`: promise-based dialogs `askEye` and `askConflict`
  (render `dialogs` in the page).
- `components/LineEditDialog.tsx`: `DosingFields` + note; blocks save on invalid fields; shows
  `prescription.eyeTaken` on a drug+eye clash and stays open. Full-screen on small screens.
- `components/EditorDialog.tsx` + `EditorContent.tsx`: lazy-loaded Quill editor, rebuilt from the
  current lines on every open. Edits are not saved.

### Text formats (`prescriptionText.ts`)
- A line renders as: drug name, then its details: the dosing sentence (`dosingToText`) **or**, if
  the line has no dosing, the drug description; then the note.
- `linesToPlainText`: name and details on separate lines, a blank line between drugs.
- `linesToHtml`: one `<p>` per line (`<strong>name</strong><br>details…`), separated by empty
  paragraphs. Paragraphs **always** get Quill's RTL classes because prescriptions are Arabic.
- `htmlToPlainText(html)` and `htmlForPaste(html)`: unchanged (editor HTML → plain text; Quill
  classes → inline styles for Word).

### Clipboard (`src/utils/clipboard.ts`)
- `copyRichText(html, text)`: async Clipboard API in secure contexts; on plain http a `copy` event
  + `execCommand("copy")` fallback that sets both formats. Failure → toast `errors.copyFailed`.

## Edge cases & limitations
- Lines keep a **snapshot** of the drug; later edits/deletes of the drug are not reflected until
  the line is removed and re-added.
- A group added twice for different chosen eyes produces separate lines per eye (by design).
- Selection is per browser (not per user or patient) and is not saved as history.
- Windows 11 Notepad ignores the HTML clipboard format (plain text only); Word keeps formatting.
- The execCommand fallback requires a real user click.

## Testing notes
Browser (real clicks, :5173, Arabic + English, desktop + 375px): add group (description fallback),
add drugs with Enter, ⊕ other eye insertion and button hiding, line edit with note, eye clash
error, editor content (RTL, bold names, sentences, note), legacy storage migration, copied
plain text/HTML.
