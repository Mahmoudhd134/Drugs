# Prescription builder: technical

## Summary
The home page (`/`). Staff add protocols or single drugs as **prescription lines**, adjust each
line's dosing for the patient, reorder, then copy (plain text + HTML for Word), optionally after
editing in a rich-text editor. **Frontend only**: nothing is saved on the server; the lines live in
`localStorage`.

## Data model / API
None of its own. Reads drugs and protocols through the existing endpoints (`GET /drugs`,
`GET /protocols`) via `DrugPicker` and `ProtocolPicker`.

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
  inserts a copy for the other eye right after the line (same dosing and note, a new key).
- `removeLine(key)`, `reorder(lines)`, `clear()` (returns a `restore` function for undo).
- `findLine(drugId, dosing)`, `addLines(lines)`, `setLineDosing(key, dosing)`: used by the
  add-protocol flow. `newLine(drug, dosing?)` and `lineIdentity(drugId, dosing)` are exported.
- `drugIds: Set<number>` for "Added" markers in the drug picker.

### Page & components
- `pages/PrescriptionPage.tsx`: two columns (catalog md=5, lines md=7; stacked on mobile).
  - **Adding a protocol** (`addProtocol`):
    1. Each protocol line → candidate with `mergeDosing(drug.defaultDosing, line.dosing)`. A drug+eye already seen in
       the protocol as saved (a protocol saved before a drug's default eye changed; the API refuses new ones) is dropped and
       counted as **duplicated** (the first wins).
    2. If any candidate eye is `ask` → `askEye(protocolName)` (right / left / both). Cancel aborts.
    3. An `ask` line and a line of the same drug for the eye then chosen (e.g. `ask` + right, the user picks right)
       become one line: identical dosings → silently one; different ones → `askConflict` with `variant: "protocol"`
       (title "Two dosings for the same eye", the two dosings as "First in the protocol" / "Second in the protocol", buttons
       "Use the first" / "Use the second" (ar: «الجرعة الأولى/الثانية في البروتوكول», «استخدام الأولى/الثانية»); Esc =
       the first; each dialog keeps its request rendered until it has faded out (`onExited`), so it never shows
       another variant's or an empty text while closing; with more such pairs, "apply to the remaining"), so no
       dosing is dropped unseen and these are **not** counted as duplicated (M1.6.0, review UI-F2).
    4. For each candidate: no existing line → new line; existing with the same dosing (`sameDosing`: normalized values,
       an unset eye equal to "none", since both write no eye) → counted as unchanged; otherwise → conflict.
    5. Conflicts are asked one by one with `askConflict` (current vs protocol sentence; a dosing with nothing to write
       shows «لا توجد جرعة محددة» / "No dosing set" in its box, an eye-only dosing only its eye part; "keep
       current" / "use the protocol's"; Esc = keep; since M1.6.0 a click outside the eye or conflict dialog does nothing,
       so the second click of a double click on the protocol can't answer it). With more conflicts left, a checkbox applies
       the answer to the rest. "Use the protocol's" replaces the existing line's dosing in place
       (position and note kept).
    6. New lines are appended; one toast, each part on its own line (joined with `\n`, the Toaster renders
       `white-space: pre-line`): `protocolAdded` always (also «…: 0»), then, when not zero, `protocolReplaced`, `protocolKept`,
       `protocolSkipped` (identical), `protocolDuplicated` (duplicated in the protocol, not added; M1.6.0: no line is dropped
       silently). Its style is **success** when something was added or replaced, otherwise the **neutral** (plain)
       toast: the prescription didn't change.
  - Adding a single drug whose drug+eye is already present → toast `prescription.alreadyAdded`.
  - Double clicks (M1.6.0): `SearchableList` (both pickers) ignores the extra clicks of a burst (`event.detail > 1`;
    keyboard activation has `detail` 0), so a double click selects once (one add, one toast); adding a protocol also
    runs in `useSingleFlight` (a click while its dialogs are open does nothing); `usePrescriptionLines` checks against the latest lines (a ref updated with every change, not
    the last render's), so a drug+eye is never added twice, even by two adds before a re-render or by a protocol whose
    dialogs were answered after other changes.
  - Clear all → toast with **Undo** (6 s). Undo puts back **exactly** the lines cleared (`clear()` returns
    `() => setLines(previous)`): a line added after the clear and before Undo is dropped, without a message. Intended
    (M1.6.1, Q1): Undo restores the prescription as it was.
  - **Copy** → `copyRichText(htmlForPaste(linesToHtml(lines)), linesToPlainText(lines))`.
- `components/CatalogPanel.tsx`: tabs **Protocols** (default) / **Drugs**; both pickers stay mounted. Each tab shows only
  with its permission (`protocols.list` / `drugs.list`; neither → `access.nothingToPick`, unreachable today since the page's
  `prescriptions.create` requires `drugs.list`; [access](../access/tech.md#frontend-srcfeaturesaccess)).
- `components/SelectionPanel.tsx`: count chip, Clear all, `PrescriptionLineList`, empty state,
  **Copy** and **Edit & copy** buttons (side by side from `sm`; on a phone full-width and stacked). Their tooltips
  (`prescription.clearAllInfo`, `quickCopyInfo`, `editAndCopyInfo`) show only while there are lines: with an empty list
  the three buttons are disabled and show no tooltip.
- `components/PrescriptionLineList.tsx`: `DosingLineList` rows: number, drug name, `LineDetails` (the Arabic dosing
  sentence, or the drug description when the dosing has no instructions: see Text formats), note; actions ✎ edit,
  ⊕ add for the other eye (only when possible), ✕ remove. Clicking the row text also edits.
- `components/useProtocolAddDialogs.tsx`: promise-based dialogs `askEye` and `askConflict`
  (render `dialogs` in the page). On a phone (375 px) the conflict dialog's two boxes («الحالي» / «من البروتوكول») are
  stacked (side by side from `sm`) and the eye dialog's three buttons (right / left / both) fit on one row. The protocol
  or drug name in their message wraps (`overflow-wrap: anywhere`), so a long unbroken name is never cut.
- `components/LineEditDialog.tsx`: `DosingFields` + note, both starting from the line's current dosing and note (its
  "Prescription text" preview is the dosing sentence only: for an eye-only dosing just the eye part; the line adds the
  drug description, see Text formats); the note is saved trimmed (only spaces = no note); blocks save on
  invalid fields; shows
  `prescription.eyeTaken` on a drug+eye clash and stays open. Full-screen on small screens. The drug name under its
  title wraps (`overflow-wrap: anywhere`).
- `components/EditorDialog.tsx` + `EditorContent.tsx`: lazy-loaded Quill editor, rebuilt from the
  current lines on every open (`useOpeningKey`: also when reopened during the closing animation). Edits are not saved.
  Quill builds its toolbar without names: after it mounts,
  `EditorContent` sets an `aria-label` on each control (`TOOLBAR_NAMES`: the icon buttons, the alignment picker's label
  and its 4 options) from `prescription.toolbar.*`, in the UI language («عريض», «المحاذاة», … / "Bold", "Alignment", …).

### Text formats (`prescriptionText.ts`)
- A line renders as: drug name, then its details: the dosing sentence (`dosingToText`); **or**, when the dosing
  has no instructions (`hasDosingInstructions` false: no dose unit, frequency, duration or tapering, i.e. empty or only
  an eye), the drug description followed by the dosing sentence, which is then only the eye part («في العين اليمنى»;
  nothing for «بدون عين»); then the note. Same rule on screen (`dosing/components/LineDetails`, also the protocol
  editor's lines). M1.6.1, Q2: before, a dosing with only an eye hid the description.
- `linesToPlainText`: name and details on separate lines, a blank line between drugs.
- `linesToHtml`: one `<p>` per line (`<strong>name</strong><br>details…`), separated by empty
  paragraphs. Paragraphs **always** get Quill's RTL classes because prescriptions are Arabic.
- `htmlToPlainText(html)` (editor HTML → plain text): one line per paragraph, `<br>` as a line break, list items as
  "1. ", "2. " (ordered) or "• " (bulleted), non-breaking spaces as normal spaces, at most one blank line in a row,
  trimmed.
- `htmlForPaste(html)` (Quill classes → inline styles for Word, on `p`, `li`, `h1`–`h3`, `ol`, `ul`):
  `ql-direction-rtl` → `dir="rtl"`; `ql-align-right|center|justify` → `text-align:…`; `ql-indent-N` →
  `margin-right:{3×N}em` in RTL (`margin-left` otherwise; e.g. `ql-indent-2` RTL → `margin-right:6em`); every `<p>` gets
  `margin-top:0;margin-bottom:0` (Word's paragraph spacing would otherwise add gaps the editor doesn't show); no
  `class` remains.

### Clipboard (`src/utils/clipboard.ts`)
- `copyRichText(html, text)`: async Clipboard API in secure contexts; on plain http a `copy` event
  + `execCommand("copy")` fallback that sets both formats. Failure → toast `errors.copyFailed`.

## Edge cases & limitations
- Lines keep a **snapshot** of the drug; later edits/deletes of the drug are not reflected until
  the line is removed and re-added.
- The pickers (`useDrugPicker`, `useProtocolPicker`) show what they loaded: a drug or protocol changed or deleted in
  another window or on another computer stays as it was until the picker loads again (a search change or the page
  opened again once the data is older than the 30 s `staleTime`; no refetch on focus), or the browser page is
  reloaded; adding it meanwhile uses the old lines and dosings. Accepted (M1.6.1, Q3).
- A protocol added twice for different chosen eyes produces separate lines per eye (by design).
- Selection is per browser (not per user or patient) and is not saved as history.
- Windows 11 Notepad ignores the HTML clipboard format (plain text only); Word keeps formatting.
- The execCommand fallback requires a real user click.

## Testing notes
Automated since M1.6 ([testing README](../../testing/README.md)): catalog area
[RX](../../testing/test-catalog.md#rx--prescription-builder); a change here adds or fixes its cases and tests. The
prescription has no API of its own (no `api` cases).

| Level | Tests |
|---|---|
| unit | Vitest `ClinicHub.Web/src/features/prescription/prescriptionText.test.ts` (plain text, HTML, paste HTML), `usePrescriptionLines.test.ts` (per-clinic storage, legacy migration, other eye, undo), `src/utils/clipboard.test.ts` |
| ui | `ClinicHub.Web/src/features/prescription/pages/` (adding drugs and protocols, "ask" eye, conflicts), `components/` (line edit, editor dialog, panels) |
| e2e | `ClinicHub.Web/e2e/prescription/` (add drugs, add protocol, conflicts, edit lines, copy with the clipboard read back, clear + undo and storage) |

Still by hand (`manual` cases, run in the [dress rehearsal](../../testing/dress-rehearsal.md)): RX-080 pasting into
Word, RX-081 into Windows Notepad and WhatsApp, RX-082 copying over plain http on the LAN, UX-011 a real phone, UX-037
the async Clipboard API over the real HTTPS deployment.
