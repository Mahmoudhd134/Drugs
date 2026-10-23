# Prescription builder: technical

## Summary
The home page (`/`). Staff add protocols or single drugs as **prescription lines**, adjust each
line's dosing for the patient, reorder, then copy (plain text + HTML for Word), optionally after
editing in a rich-text editor. **Frontend only**: nothing is saved on the server; the lines live in
`localStorage`.

## Data model / API
None of its own. Reads drugs and protocols through the existing endpoints (`GET /drugs/tree` and `GET /drugs`,
`GET /protocols`) via `DrugTree` (M1.7c) and `ProtocolPicker`.

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
- `drugIds: Set<number>` for "Added" markers in the drug tree.

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
    7. Lines of drugs the platform admin disabled (`drug.withdrawn`, shared catalog, M1.7b) are added like the others
       (asked about like the others, counted in the toast above as usual). When N of the **new** lines are such lines, a
       second toast follows the protocol's: `toast(t("prescription.protocolWithdrawn", {count: N}), {icon: "⚠️"})`
       («أُضيف رغم تعطيله من الإدارة: N», plain style, ⚠ icon, dismissible like every toast); none when N = 0.
  - Adding a single drug whose drug+eye is already present → toast `prescription.alreadyAdded`.
  - Double clicks (M1.6.0): `SearchableList` (the protocol picker) and `DrugTree`'s rows (M1.7c) ignore the extra clicks
    of a burst (`event.detail > 1`; keyboard activation has `detail` 0), so a double click selects once (one add, one
    toast) and a double click on a tree node leaves it open; adding a protocol also
    runs in `useSingleFlight` (a click while its dialogs are open does nothing); `usePrescriptionLines` checks against the latest lines (a ref updated with every change, not
    the last render's), so a drug+eye is never added twice, even by two adds before a re-render or by a protocol whose
    dialogs were answered after other changes.
  - Clear all → toast with **Undo** (6 s). Undo puts back **exactly** the lines cleared (`clear()` returns
    `() => setLines(previous)`): a line added after the clear and before Undo is dropped, without a message. Intended
    (M1.6.1, Q1): Undo restores the prescription as it was.
  - **Copy** → `copyRichText(htmlForPaste(linesToHtml(lines)), linesToPlainText(lines))`.
- `components/CatalogPanel.tsx`: tabs **Protocols** (default) / **Drugs**; both stay mounted (the tree keeps its search,
  open nodes and scroll position across tab switches, CAT-124: `DrugTree` keeps the panel's `scrollTop` from its
  last scroll while shown and puts it back when a `ResizeObserver` sees the panel get a size again, since Chromium's own
  restore of a `display: none` box came back ~2 px per loaded row too far down, T5 AC-2). The Drugs tab is
  `<DrugTree onSelect selectedIds autoFocus={tab === "drugs"} maxHeight="58vh" enabled={canDrugs}/>` (see
  [The drug tree](#the-drug-tree-drugtree) below). Selecting a drug keeps the search, the open nodes, the
  loaded pages and the scroll position (the old picker cleared its search). Each tab shows only
  with its permission (`protocols.list` / `drugs.list`; neither → `access.nothingToPick`, unreachable today since the page's
  `prescriptions.create` requires `drugs.list`; [access](../access/tech.md#frontend-srcfeaturesaccess)).
- `components/SelectionPanel.tsx`: count chip, Clear all, `PrescriptionLineList`, empty state,
  **Copy** and **Edit & copy** buttons (side by side from `sm`; on a phone full-width and stacked). Their tooltips
  (`prescription.clearAllInfo`, `quickCopyInfo`, `editAndCopyInfo`) show only while there are lines: with an empty list
  the three buttons are disabled and show no tooltip.
- `components/PrescriptionLineList.tsx`: `DosingLineList` rows: number, drug name, `LineDetails` (the Arabic dosing
  sentence, or the drug description when the dosing has no instructions: see Text formats; for a **shared** drug with
  neither, a muted «لا توجد جرعة محددة» / "No dosing set", screen only, never copied; an own drug's line keeps showing
  its name alone, RX-060), note, and `WithdrawnChip` («معطّل من الإدارة» with its tooltip) when the line's snapshot has
  `withdrawn: true` (a tap on it shows the tooltip without opening the line); actions ✎ edit, ⊕ add for the other eye
  (only when possible), ✕ remove. Clicking the row text also edits.
- The protocols tab's rows (`ProtocolPicker`) list their drugs «A · B», each name an inline-block `<bdi>` (its own
  direction, kept whole on a line when it fits, aligned to the interface's start side; M1.7b D27, M1.7c C37), show
  «الأدوية: N» (every line) and, when some lines' drugs are disabled,
  `WithdrawnChip count={n}` («معطّل من الإدارة: n»; inside the option, so not a Tab stop of its own).
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
- `components/EditorDialog.tsx` + `EditorContent.tsx` + `QuillEditor.tsx`: lazy-loaded Quill 1 editor, rebuilt from the
  current lines on every open (`useOpeningKey`: also when reopened during the closing animation). Edits are not saved.
  `QuillEditor` is our wrapper (react-quill 2 relied on `findDOMNode`, removed in React 19) and keeps react-quill's behavior:
  Quill is created once, `value` is pasted in on mount and when it differs from the editor's last HTML, and each text change
  reports `root.innerHTML` through `onChange` when it differs. Quill 2 is not used: it renders bullet lists as `<ol>`.
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

### The drug tree (`DrugTree`)
`features/drugs/components/DrugTree.tsx` (+ `DrugTreeRows.tsx`, `DrugTreeBucket.tsx`; pure logic in `drugTreeModel.ts`,
data in `treeApi.ts`; design M1.7 D7, D9, contract `docs/design/m1.7c-contract.md` § 3.3). Used here and in the protocol
editor ([protocols](../protocols/tech.md)); props `onSelect`, `selectedIds`, `autoFocus`, `maxHeight` (default 58vh),
`enabled` (false: no request). The drugs page's tree view (M1.7 review R1) also passes `filters` (search, source,
category, subcategory from its URL: no search box, source toggle, «النتائج: N» or progress bar of the tree's own; the
answer narrowed by `filterTree`, the chosen category opened; a change of them is a new tree), `rowMode="open"` (no
«مُضاف», no ⊕) and `rowActions` (buttons at a drug row's end; their clicks never reach the row): [drugs](../drugs/tech.md).
- **Top:** `SearchField` (`drugTree.searchPlaceholder`, debounced 300 ms, trimmed; only spaces or tatweel = no search;
  Esc clears it with `preventDefault` + `stopPropagation`, so no dialog or leave guard reacts; ↓ focuses the tree), the
  source toggle (`drugs.source.*`, exclusive, never null; per tree, starts at «الكل», C7), «النتائج: N» (`treeTotal`),
  and a thin `LinearProgress` while a new search or source loads over the old tree (`isPlaceholderData`).
- **Data:** `useDrugTree(search, source)` (`GET /drugs/tree`; the previous answer stays as placeholder only while its
  query is still cached, so after a context switch clears the cache nothing of the other clinic shows, CAT-129) and one
  `useDrugBucket` per open subcategory (`GET /drugs?categoryId=&subCategoryId=<id>|none` + search + source, 30 per page;
  rows `dedupeById`). Order: `sortTree` on render (name with `Intl.Collator(language)`, by count when searching, pinned
  rows then the «بدون تصنيف فرعي» bucket last): a language switch re-sorts without a request.
- **What is shown:** the tree's state (`View`: the search and source of its answer, open categories, open buckets)
  changes only on the **first answer** of a new (search, source): everything closes, the scroll panel goes back to its
  top (M1.7c C36), then `autoOpenBucket` opens the lone bucket and its category, and with a search `singleDrugBuckets` also opens every category whose only subcategory holds a single drug, with that subcategory (M1.7 review R3). A refetch of the same key (a drug saved) changes nothing (C12), so a bucket the user
  closed stays closed. The open buckets keep the shown tree's search and source until the new answer replaces it.
  Closing a bucket (or its category, which closes its buckets, or a new tree) removes its query
  (`queryClient.removeQueries`, after the commit), so reopening starts at page 1.
- **Rows:** ARIA `tree` / `treeitem` (`aria-level` 1–3, `aria-expanded`, names `drugTree.nodeLabel` «الاسم، العدد» for
  nodes, the drug name for drugs) with nested `role="group"` (a bucket's has `aria-busy` while a page loads). Node line:
  chevron `IconButton` (`tabIndex -1`, `drugTree.open`/`close` as tooltip and `aria-label`; closed: `ChevronRight` LTR /
  `ChevronLeft` RTL; open: `ExpandMore`), the name (wraps anywhere), the count (grouped digits); at least 44 px tall
  below `sm`. Drug line: name, the ingredients on one line from `sm` (ellipsis, full text in a `TapTooltip` without tap,
  since a tap adds the drug; wraps on a phone), an own drug's `DosingText`, the «خاص بالعيادة» chip on an own drug
  (a shared drug has no chip, M1.7 review R2), «مُضاف» or ⊕; no description. The name sits in a `<bdi>` (M1.7b D27: a Latin name reads left to right in the Arabic UI). The
  ingredients line is `dir="auto"` with the text directly inside it, no `<bdi>` (its own text's direction: its beginning
  visible, the ellipsis at its end; `dir="auto"` skips a `<bdi>` child when it looks for the first strong character, so
  the line would compute left to right, CAT-262) and a line that fits is aligned to the interface's start side (`textAlign: "left"`, flipped by the RTL style
  cache; M1.7c C34). The click handler is on the `treeitem`
  itself (a click anywhere on the row, the chevron included, toggles a node or adds a drug); a click coming from inside
  its `role="group"` (a nested row, «تحميل المزيد», a retry) is left to them. A click whose `event.detail > 1` is
  ignored.
- **Paging:** after a bucket's last loaded drug a `data-testid="drug-tree-sentinel"` element, observed by an
  `IntersectionObserver` whose root is the scroll panel (a new observer after each page; none while a page loads or after
  an error); `fetchNextPage({cancelRefetch: false})`, so a page in flight is never asked again. Then a spinner while a page
  loads, «تحميل المزيد» while more exist, or «تعذّر تحميل البيانات.» + «إعادة المحاولة» for a failed page (that bucket
  only). Without `IntersectionObserver` (jsdom without the test fake) only the button loads more.
- **Keyboard:** roving `tabIndex` (one Tab stop: the active row, else the first row); `treeKeyAction` maps the keys
  (C3, mirrored in RTL); ↓ on the last loaded drug of a bucket with more pages loads the next page and focuses its first
  new drug once rendered; Enter on a drug adds it and keeps the focus there; ← / Esc on a drug closes its bucket and
  focuses it. «تحميل المزيد» does the same as ↓ (the focus goes to the bucket's last loaded drug at once, then to the
  first new drug); only these two move the focus to the first new drug. A next-page retry (pressed on its button)
  focuses the bucket's last loaded drug and the focus stays there when the page arrives (C33: an arriving page never
  takes the focus); a first-page retry focuses the subcategory row; the tree's own retry focuses the search field (C28), so the focus never falls to `<body>` when the button gives way to the spinner. A focus waiting for a
  row that isn't rendered yet is dropped by any other key action, another row taking the focus, a new tree (search or
  source), a failed or closed bucket, or the focus leaving the tree's panel: it never steals the focus later.
- **States instead of the tree:** first load spinner; the tree request failed → `common.loadFailed` + retry; no category →
  `drugs.noOwnDrugs` (source own, no search) or `drugs.noResults`.
- **Look** (M1.7 review R4): a pictogram tile per category (`categoryIcons.tsx`, by catalog id; generic for others), count pills, guide lines
  from an open node to its children, the open category's row pinned at the panel's top (`scroll-margin-top` on rows), ⊕ as a round target.

## Edge cases & limitations
- Lines keep a **snapshot** of the drug (`DrugSnapshot`: id, name, description, default dosing, and since M1.7b
  `isShared` / `withdrawn`, optional: lines stored before M1.7 lack them and still load, edit and copy); later
  edits/deletes of the drug (a rename by the super admin, a withdraw) are not reflected until the line is removed and
  re-added. A line added before its drug was disabled keeps no chip and works as before (⊕ included).
- The tree and the protocol picker (`useDrugTree` / `useDrugBucket`, `useProtocolPicker`) show what they loaded: a drug
  or protocol changed, deleted or disabled in another window or on another computer stays as it was until they load
  again (a disabled drug clicked meanwhile is added, CAT-166) (a search change or the page
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
