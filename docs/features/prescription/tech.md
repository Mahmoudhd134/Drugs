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
- Persisted per clinic to `localStorage["prescription.lines.<clinicId>"]` (`usePrescriptionLines(clinicId)`)
  on every change; storage errors are ignored. The old unscoped `prescription.lines`, or else
  `prescription.selection`, moves to the first clinic opened.
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
    1. Each group line → candidate with `mergeDosing(drug.defaultDosing, line.dosing)`. A drug+eye already seen in
       the group as saved (a group saved before a drug's default eye changed; the API refuses new ones) is dropped and
       counted as **duplicated** (the first wins).
    2. If any candidate eye is `ask` → `askEye(groupName)` (right / left / both). Cancel aborts.
    3. An `ask` line and a line of the same drug for the eye then chosen (e.g. `ask` + right, the user picks right)
       become one line: identical dosings → silently one; different ones → `askConflict` with `variant: "group"`
       (title "Two dosings for the same eye", the two dosings as "First in the group" / "Second in the group", buttons
       "Use the first" / "Use the second" (ar: «الجرعة الأولى/الثانية في المجموعة», «استخدام الأولى/الثانية»); Esc =
       the first; each dialog keeps its request rendered until it has faded out (`onExited`), so it never shows
       another variant's or an empty text while closing; with more such pairs, "apply to the remaining"), so no
       dosing is dropped unseen and these are **not** counted as duplicated (M1.6.0, review UI-F2).
    4. For each candidate: no existing line → new line; existing with the same dosing (`sameDosing`) → counted as
       unchanged; otherwise → conflict.
    5. Conflicts are asked one by one with `askConflict` (current vs group sentence; "keep
       current" / "use the group's"; Esc = keep; since M1.6.0 a click outside the eye or conflict dialog does nothing,
       so the second click of a double click on the group can't answer it). With more conflicts left, a checkbox applies
       the answer to the rest. "Use the group's" replaces the existing line's dosing in place
       (position and note kept).
    6. New lines are appended; toast lines `groupAdded`, `groupReplaced`, `groupKept`,
       `groupSkipped` (identical), `groupDuplicated` (duplicated in the group, not added; M1.6.0: no line is dropped
       silently).
  - Adding a single drug whose drug+eye is already present → toast `prescription.alreadyAdded`.
  - Double clicks (M1.6.0): `SearchableList` (both pickers) ignores the extra clicks of a burst (`event.detail > 1`;
    keyboard activation has `detail` 0), so a double click selects once (one add, one toast); adding a group also
    runs in `useSingleFlight` (a click while its dialogs are open does nothing); `usePrescriptionLines` checks against the latest lines (a ref updated with every change, not
    the last render's), so a drug+eye is never added twice, even by two adds before a re-render or by a group whose
    dialogs were answered after other changes.
  - Clear all → toast with **Undo** (6 s).
  - **Copy** → `copyRichText(htmlForPaste(linesToHtml(lines)), linesToPlainText(lines))`.
- `components/CatalogPanel.tsx`: tabs **Groups** (default) / **Drugs**; both pickers stay mounted. Each tab shows only
  with its permission (`groups.list` / `drugs.list`; neither → `access.nothingToPick`, unreachable today since the page's
  `prescriptions.create` requires `drugs.list`; [access](../access/tech.md#frontend-srcfeaturesaccess)).
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
plain text/HTML. M1.6.0: a group with two lines for the same drug and effective eye → one line added, the toast says
"Duplicated in the group, not added: 1" / «مكرر في المجموعة ولم يُضف: 1» (EN/AR, 1280/375); an `ask` line + a right
line of the same drug, right chosen → the "Two dosings for the same eye" dialog, the picked dosing added, no
"duplicated" line; fast double clicks on a drug and on a group add it once (one flow, one dialog).
