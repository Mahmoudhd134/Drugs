# Prescription print templates, step 3 (drag): contract (T0)

Scope: [step 3's design](prescription-templates.step3.md) (S1–S5 and its § 3 "Settled by the T0 reviews" approved, not reopened), cases TPL-400…482 and TPL-500…593, and the changed TPL-054, TPL-227, TPL-228. **Frontend only:** no route, no table, no migration, no new library. **Out of scope:** guide image, calibration, test print (step 4), multi-select, rotation, anything dimmed in the panel, printing changes beyond keeping print at true size.

This contract **is compiled code**: `npx tsc -b` and `npx eslint src e2e` are clean, the solution builds with 0 warnings. `dragGeometry.ts` and `layoutHistory.ts` are stubs; the constants, the i18n keys and the test support named below are done. Every exported name and signature, key, text, accessible name and test id here is final: a track that needs to change one goes through the session (both sides). How the coder splits the code behind them (hooks, internal helpers, internal props) is free. It builds on steps 1 and 2, still moving on their own branches: [step 1's contract](prescription-templates.contract.md) and [step 2's](prescription-templates.step2.contract.md) stay in force but for what § 3.7 changes.

---

## 1. What stays

The item's data, `validateLayout`, the save and delete flows, the guard (`useUnsavedGuard`), click to add, typed mm fields, the desktop-only switch and print mode (`print` on `TemplateSheet`, `PrintRoot`) keep working as they do. Print never sees the zoom: it renders through step 2's root at true size. `layout.ts` doesn't change.

---

## 2. Pure logic

### 2.1 `dragGeometry.ts` (**stub**, StrykerJS-mutated)

The signatures and the rules are in the file's comments, which are part of this contract. In short:

| Function | Cases |
|---|---|
| `pointToMm(point, sheetRect, page)` | TPL-462, TPL-533, TPL-543 |
| `pastDragThreshold(dxPx, dyPx)` | TPL-503 |
| `dropCounts(point, sheetRect, areaRect)` | TPL-505, TPL-506 |
| `moveBox(start, rawXMm, rawYMm, {page, others, unsnapped})` → `{box, guides}` | TPL-404, TPL-412, TPL-430–432, TPL-435, TPL-533, TPL-535–537, TPL-539 |
| `resizeBox(start, handle, edge, minimum, context)` → `{box, guides}` | TPL-420, TPL-422, TPL-433, TPL-534, TPL-536, TPL-545 |
| `minimumOf(item)` | TPL-422 |
| `nudgeBox(box, dxMm, dyMm, page)` | TPL-442, TPL-540, TPL-544 |
| `handlesFor(box, zoomPercent)`, `handlePositionPx(box, handle, zoomPercent, cornersOnly)` | TPL-551, TPL-547, TPL-550 |
| `fitZoom(areaWidthPx, areaHeightPx, page)`, `zoomIn`, `zoomOut`, `canZoomIn`, `canZoomOut` | TPL-460, TPL-461, TPL-580, TPL-587 |
| `autoScrollDirection(point, areaRect)` | TPL-470, TPL-585 |

`others` is every other item's box, in the layout's order. A drag's raw position always comes from the press, so 50 small moves and one big one give the same mm (TPL-541): a move's raw top-left = the pointer in mm now, minus (the pointer in mm at the press, minus the box's start at the press); a resize's raw `edge` = the pointer in mm now, minus (the pointer in mm at the press, minus that moving edge at the press), so grabbing a handle a little off its corner doesn't jump. An off-sheet item's first handle drag also brings the axis that doesn't move inside (the unit half of TPL-544).

### 2.2 `layoutHistory.ts` (**stub**, StrykerJS-mutated)

`EMPTY_HISTORY`, `recordStep`, `recordNudge`, `endRun`, `canUndo`, `canRedo`, `undoStep`, `redoStep`, `isDirty`; signatures and rules in the file's comments. Selection after a step (TPL-577):

| Step | Undo selects | Redo selects |
|---|---|---|
| `add` | nothing | the item |
| `remove` | the item | nothing |
| `item` | the item | the item |
| `page` | what's selected, if it exists in that layout; else nothing | the same |

### 2.3 Constants (`constants.ts`, done)

`CSS_PX_PER_MM`, `DRAG_THRESHOLD_PX` 4, `GUIDE_REACH_MM` 1, `HANDLE_SIZE_PX` 8, `SMALL_BOX_PX` 36, `ZOOM_MIN` 50, `ZOOM_MAX` 200, `ZOOM_STEP` 25, `FIT_MIN_ZOOM` 25, `AUTO_SCROLL_BAND_PX` 24, `AUTO_SCROLL_PX_PER_FRAME` 8, `HISTORY_LIMIT` 50, `NUDGE_RUN_MS` 1000, `AREA_PADDING_PX` 16, `AREA_BOTTOM_GAP_PX` 24 (the page's own bottom padding, § 6.24), `AREA_MIN_HEIGHT_PX` 240. The minimums are step 1's.

---

## 3. The screen

### 3.1 i18n (done, final; `printTemplates.toolbar.*`, `en.ts` / `ar.ts`)

| Key | en | ar |
|---|---|---|
| `undo` | Undo | تراجع |
| `redo` | Redo | إعادة |
| `zoomOut` | Zoom out | تصغير |
| `zoomIn` | Zoom in | تكبير |
| `fit` | Fit | ملاءمة |

No other text. The Arabic words are the design's § 5. No error message is new.

### 3.2 The toolbar

Step 1's row above the grid becomes one row, `justifyContent: "space-between"`: the toolbar first (the UI language's start), Save and Delete as they are at its end. So the toolbar adds no height above the area (TPL-590). `data-testid="template-toolbar"`, a plain `Stack direction="row"`, no `role="toolbar"` (it would promise arrow-key focus, and need a label no doc has). Each button has a `Tooltip` with its text, shown when off too, through a `span` (MUI's rule for a disabled child).

| In order | Control | Accessible name | Off when | Does |
|---|---|---|---|---|
| 1 | `IconButton` `UndoIcon` | `toolbar.undo` | Nothing to undo and no open field with a real change (§ 3.6) | § 3.6 |
| 2 | `IconButton` `RedoIcon` | `toolbar.redo` | Nothing to redo | § 3.6 |
| 3 | `IconButton` `RemoveIcon` | `toolbar.zoomOut` | `!canZoomOut` | `zoomOut` |
| 4 | `Typography`, `data-testid="template-zoom-percent"`, `dir="ltr"` | its text: `${Math.round(zoom)}%` | | |
| 5 | `IconButton` `AddIcon` | `toolbar.zoomIn` | `!canZoomIn` | `zoomIn` |
| 6 | `Button size="small"` | `toolbar.fit` | never | `fitZoom` of the area now |

`UndoIcon` and `RedoIcon` mirror in Arabic (`scaleX(-1)`, as `BackButton`). A button that turns off because of its own press passes the focus to the sheet's area (TPL-557). Zooming and selecting are no steps.

### 3.3 The sheet's area, frame, overlay, ghost

```
Box role="region" (the area, step 1's, dir="ltr", tabIndex 0)
└ div data-testid="template-sheet-frame"            position: relative; inline width and height = the sheet's mm × CSS_PX_PER_MM × zoom / 100; margin 0 auto; the shadow
  ├ div                                             position: absolute; left: 0; top: 0; inline transform: scale(zoom / 100); transform-origin: 0 0; absolute, so it takes the sheet's width and only the frame sizes the scroll (a block would take the frame's width and scale it twice)
  │ └ TemplateSheet                                 data-testid="template-sheet" as in step 1: still width and height in mm, boxes in mm
  └ div data-testid="template-overlay"              position: absolute; inset 0; pointer-events: none; hidden in print
    ├ div data-testid="template-handle-<id>" data-handle="<id>" aria-hidden="true"     pointer-events: auto
    └ div data-testid="template-guide" data-axis="x|y" data-mm="<value>" aria-hidden="true"
```

- **The area:** `height` in px, from the window: `max(AREA_MIN_HEIGHT_PX, window height - its top in the page - AREA_BOTTOM_GAP_PX)`, re-measured when the window resizes (the zoom stays). `maxHeight` goes. Padding `AREA_PADDING_PX`. Still `overflow: auto`, `dir="ltr"`, so `scrollLeft` is never negative.
- **The transform stays in the designer**, around the sheet: `TemplateSheet` itself gets none, so print can't see it. `getBoundingClientRect` of `template-sheet` is the scaled rectangle, what `pointToMm` needs.
- **`TemplateSheet`'s boxes** (designer only): same button, same `data-item-id`, `aria-pressed`; `touch-action: none`, `user-select: none`, `cursor: move`. Inline positions in mm, as always.
- **Handles:** only the selected item's, from `handlesFor` at the current zoom, at `handlePositionPx` (`cornersOnly`: the set on screen has four), each `HANDLE_SIZE_PX` square at any zoom, drawn in `ALL_HANDLES` order; white with a 1 px `#0f766e` border, `touch-action: none`, cursors `nwse-resize`, `ns-resize`, `nesw-resize`, `ew-resize`. Never focusable: keyboard resizing stays in the number fields. Ids: `nw n ne e se s sw w`, physical, the same in both languages. **The set is frozen during a drag.**
- **Guides:** one per entry of a drag's `guides`, `data-mm` holding the value, a 1 px line across the whole sheet, `#db2777`. Gone at the end of the drag.
- **The ghost:** `data-testid="template-drag-ghost"`, `aria-hidden="true"`, `position: fixed`, its top-left at the pointer, the new item's default size × zoom, showing the entry's label; `pointer-events: none`. Rendered in the designer, not in a portal under `body`.

### 3.4 Pointer flows

Only the main button starts anything (`event.button === 0`). Nothing in a drag changes `draft.layout`: the sheet, the handles and the settings' fields show a preview, and the drop commits (design § 3 settled). So a drag leaves Save and the guard alone until the drop.

**Press on a box:** the item is selected, the box gets the focus (`preventScroll`), the pointer is captured, `user-select: none` on `body` until the end. A press selects: the existing `onClick` still does for the keyboard, TPL-549, and a pointer click repeats the same selection.

**Press on a handle:** the same, with the capture on the handle; `mousedown` `preventDefault` on the handle only, so the focus stays on the box (a handle isn't focusable). Never on a box's `mousedown`: that would lose the focus (TPL-559).

**Press on a panel entry** (not on a disabled one): capture on the entry, nothing visible until the threshold.

**Move:**
- `(event.buttons & 1) === 0`: as a cancel (the release was missed).
- Not past `pastDragThreshold` from the press yet: nothing. Once past, it stays a drag, also back at the press point.
- A box: `moveBox`; a handle: `resizeBox` with `minimumOf(item)`; a panel entry: the ghost follows, and over the sheet (`dropCounts`) `moveBox` gives only the guides. `unsnapped` is `event.altKey` of this event, so Alt counts at each move and at the release.
- The area's `scroll` (auto-scroll, the wheel) recomputes from the last pointer position through the new rectangle (TPL-531).
- **Auto-scroll:** one `requestAnimationFrame` loop during a drag, `autoScrollDirection` × `AUTO_SCROLL_PX_PER_FRAME`, also with the pointer held still. It stops when the drag ends.

**Release:**
- A box or handle past the threshold: `recordStep` with `{kind: "item", itemId}`, `updateItem` of the box. The same layout: no step, nothing unsaved (TPL-542). The box keeps the focus.
- A panel drag past the threshold with `dropCounts`: `addItem`, then `updateItem` to the `moveBox` result (`start` = the default size at 0, 0), `recordStep` with `{kind: "add", itemId}`, selected, the focus on the new box. Without `dropCounts`, or at 50 items: nothing.
- Below the threshold: nothing here; the `click` does what it does in step 1.
- **The pointer `click` after a drag or a cancel is swallowed**, on boxes and entries, so a drag never adds a second item or selects again after a second Esc. Only `event.detail > 0`: a keyboard click (`detail` 0) is never swallowed. The flag clears on that click or at the next press.

**Cancel** (`pointercancel`; `lostpointercapture` with no `pointerup`; `buttons === 0`; `popstate`; Esc; unmount): the preview goes, nothing recorded, the selection stays, the scroll stays. After Esc with the button still held, moves do nothing until the release, which does nothing. Unmount also removes every listener, the ghost, and restores `user-select`, with no console error (TPL-514). A release outside the window arrives through the capture and counts as a release at those coordinates, clamped by `moveBox` (TPL-510); a panel drag fails `dropCounts` (TPL-511).

### 3.5 Keyboard

One `keydown` and `keyup` listener on `window`, while the designer shows (a draft, at ≥ 900 px). `event.code` for letters (`KeyZ`, `KeyY`: Arabic layouts, Caps Lock), `event.key` for arrows, Delete, Esc, Alt. `preventDefault` whenever the designer handles a key, also at the sheet's edge.

**The focus decides** (`document.activeElement`):

| Focus | Undo, redo shortcuts | Arrows, Alt's own key, Delete, Esc |
|---|---|---|
| `input`, `textarea`, contenteditable | Not handled: the field's own | Not handled |
| Inside a dialog or menu, or any **open** `role="dialog"`, `menu`, `listbox` in the document (one inside a closed, kept-mounted `.MuiModal-hidden` doesn't count: `AppShell`'s phone drawer is always there) | Not handled | Not handled |
| Outside the designer's root (`data-testid="template-designer"`) but not `body` (clinic tabs, sidebar, app bar) | Not handled | Not handled |
| A box other than the selected one | Handled | Not handled, and not `defaultPrevented` (TPL-556) |
| The size select (`role="combobox"`) | Handled | Not handled: its arrows open it |
| The selected box; `body`; the area; anything else in the designer (a panel entry, a toolbar button) | Handled | Handled, when an item is selected |

Nothing selected: arrows, Alt, Delete and Esc aren't handled (TPL-516). So after adding by a click, the focus stays on the entry and arrows move the new item.

| Key | Result |
|---|---|
| `ctrl` or `meta` + `KeyZ`, no shift | Undo |
| `ctrl` or `meta` + `KeyY`, or + shift + `KeyZ` | Redo |
| Arrows, no ctrl or meta | `nudgeBox` by 1 mm; with Shift 5; with Alt 0.1 (Alt wins over Shift); `recordNudge` with `Date.now()`; the box scrolled into view inside the area (`block: "nearest", inline: "nearest"`, TPL-561) |
| Ctrl + arrows | Not handled |
| Alt alone (`keydown`, `keyup`) | `preventDefault`, nothing else |
| Delete | As Remove item (`recordStep` `{kind: "remove"}`), never on the prescription text, where it's handled and nothing happens; the focus to the area. Backspace isn't handled |
| Esc | Deselect; the focus stays |

**During a drag** a second `keydown` and `keyup` listener in the capture phase, whatever is selected: Esc cancels (`stopPropagation`, so the same press doesn't also deselect), Alt `preventDefault` on both; arrows, Delete, Tab, Enter, Space and the undo and redo shortcuts are `preventDefault` and `stopPropagation`, and do nothing. Anything else passes.

### 3.6 Draft and undo

`Draft` gains `history: LayoutHistory` (`EMPTY_HISTORY` in `startDraft`) and `openField: {itemId: string; before: PrintLayout} | null`. So history lives and dies with the draft: removed with the template, gone when the page is left, untouched by a refetch (TPL-570). `dirty` is `isDirty(layout, baseline, rawInputs)`.

**Fields.** Typing still updates the layout at once (TPL-044). The first change sets `openField`. A **commit** records it (`recordStep(before, layout, {kind: "item", itemId})`, a no-op with no real change, TPL-563) and clears it:

| Field | Commits on |
|---|---|
| X, Y, width, height, font (`MmField` `onCommit`) | blur, Enter |
| Name | blur, Enter |
| Static text | blur only: Enter is a new line (TPL-564) |
| The sheet's size, width, height | Their own commit from step 1 records `{kind: "page"}`, re-fitting when the page changed. No real change or an invalid measure: no step, no re-fit (TPL-579) |

Anything that records a step, and undo and redo, first commits an open field (the field unmounted below 900 px gets no blur). Selecting, Save and the end of a nudge run call `endRun`.

**Undo and redo** (button or shortcut): commit an open field, then `undoStep`/`redoStep`; `layout`, `selectedId` and `history` from its answer; `rawInputs`, `serverErrors` and `openField` cleared; `refit` re-fits. `baseline` never changes here. A focused box the step removed: the focus goes to the area. Toolbar Undo with a focused field: the press blurs it first, so its commit is what's undone, and `MmField` shows the layout's value (TPL-581).

### 3.7 What changes from steps 1 and 2

- **Design § 3:** "1 mm = 1 CSS mm" becomes "at 100%". Print stays true size.
- **Step 1 contract § 3.3, sheet area:** `maxHeight` is replaced by § 3.3's `height`. The focus rule stands, with § 3.5 and the table below added.
- **Step 1 contract § 3.3, number fields:** still `updateItem` on every change, plus `openField` and the commit above.
- **Selection:** still a click, Enter or Space; a press selects too.
- **Tests:** TPL-054, TPL-227 and TPL-228 call `zoomTo(designer, 100)` before measuring. TPL-227 also has the far corner reachable at 100%.

| Action | Focus goes to |
|---|---|
| Add by a click, Enter or Space | Stays on the entry |
| A drop from the panel | The new box |
| A press or a drag on a box or handle | That box |
| Esc | Stays |
| Delete, Remove item, an undo or redo removing the focused box | The area |
| A toolbar button turning off by its own press | The area |

### 3.8 Zoom

`zoom` is the designer's state, in percent, never in the layout or the history. **Fit** is computed when the area's element first appears, however it appears (load, «إنشاء قالب», widening from below 900 px), from its measured inner size (`clientWidth`/`clientHeight` minus the padding), after its height is set; and on a page step's `refit` and a real page-size change. Changing the window keeps the zoom. No size to measure (jsdom): 100.

---

## 4. Test support (done)

### 4.1 `src/test`

- `setup.ts`: `setPointerCapture`, `releasePointerCapture`, `hasPointerCapture` are no-ops, and `PointerEvent` is stubbed: jsdom 26.1 has none. jsdom has no layout, so a drag's **geometry** can't run there: where an item lands is e2e (the levels below say so). `user.click`, `user.keyboard` and `fireEvent.keyDown` work, and so do `fireEvent.pointerDown` and `pointerMove` (pass `button: 0`, `buttons: 1`, `clientX`, `clientY`), since the threshold needs no layout: the ghost and the drag's key handling can be seen there (TPL-508's "a drag works again", TPL-517's "or a drag runs"). TPL-540's "in the request" is `normalizeLayout` of the result, at unit level.
- `pages/printTemplate.tsx`: `undoButton`, `redoButton`, `zoomOutButton`, `zoomInButton`, `fitButton`, `zoomPercent`, `handleOf`, `handleIds`. Fit is 100% there: `zoomPercent()` starts as `100%`.
- `fireEvent.keyDown` returns false when `defaultPrevented`: the ui half of TPL-515, TPL-516, TPL-517, TPL-519, TPL-556.

### 4.2 E2E (`e2e/support/print-template.ts`)

`designerOf` gains `undo`, `redo`, `zoomOut`, `zoomIn`, `fit`, `zoomPercent`, `frame`, `handle(id)`, `handles`, `guides`, `ghost`; `PT_TEXTS` the five labels; `zoomTo(designer, percent)`. `placeOf` measures on screen, so it's in true mm **only at 100%**. The drag helpers are `tests-e2e`'s, in this file: real `page.mouse`, never synthetic events except where a real mouse can't produce the case: `pointercancel` (TPL-414, TPL-513), and a move with `buttons: 0` or a `lostpointercapture` with no `pointerup` (TPL-512). TPL-553: the overflowing item comes **later** in the order than its neighbour, since the later one is on top (design § 3 "Overlap").

`expectNoCutOrOverlap` needs no change: the handles and guides have no text and aren't buttons.

---

## 5. Work split

Each track: branch `print-templates-step3/<track>`, its own git worktree, from this contract's commit. Ports from its block, never 5640–5649, :5000 or :5173; never `drags`; a scratch database `drags_print_templates_step3_<track>` only if needed, dropped at the end. All tests run on CI (`./ci.ps1`; pushing the track's branch is allowed). Test writers read the docs and this contract, never the coder's diff. Commits plain, no AI attribution.

| Track | Role | Ports | Owns (no file has two owners) |
|---|---|---|---|
| `frontend` | coder | 5730–5739 | `src/features/printTemplates/{dragGeometry,layoutHistory}.ts`, any new `src/features/printTemplates/use*.ts`, `components/{TemplateDesigner,TemplateSheet,TemplateSidePanel,TemplateSettings,MmField}.tsx`, new `components/*.tsx`; docs: `docs/features/prescription-templates/{tech,business}.md`, `docs/tech/overview.md`, `docs/business/overview.md`, `docs/design/prescription-templates.md` (§ 3's sentence) |
| `tests-component` | test writer | 5740–5749 | `src/features/printTemplates/{dragGeometry,layoutHistory}.test.ts`, `components/TemplateDesigner.{keys,undo,zoom}.test.tsx` and fixes to the other `TemplateDesigner.*.test.tsx`, `src/test/**`, `src/i18n/locales/{locales,docMessages}.test.ts`, `vite.config.ts` (`PURE_LOGIC`), `stryker.config.json`, `vitest.stryker.config.ts`; **`docs/testing/test-catalog.md`** (every step 3 row, the three changed, the summary) |
| `tests-e2e` | test writer | 5750–5759 | `e2e/admin/print-template-*.spec.ts` (new ones: drag, resize, guides, keyboard, undo, zoom, scroll), `e2e/admin/print-template.spec.ts` (TPL-054, 227, 228, and any other that measures), `e2e/support/print-template.ts`, `e2e/ux/**` |

The coder runs `dotnet build ClinicHub.sln` (0 warnings), `npx tsc -b`, `npx eslint src e2e`. T2: merge all into the feature branch, `./ci.ps1 -Tier full` in report mode, 3 times. Stryker (T5): StrykerJS on `dragGeometry.ts`, `layoutHistory.ts`; nothing on the backend.

### Cases per test track

**`tests-component`**
- unit: TPL-404, 412, 422, 430, 432, 433, 435, 442, 450–453, 457, 533–537, 539, 540, 545, 551, 558, 576–578; the unit half of TPL-420, 431, 544.
- ui: TPL-402, 440, 443–445, 455, 456, 458, 459, 461, 463, 482, 508, 516, 517, 519–521, 538, 552, 556, 557, 560, 563–567, 569–575, 579, 581, 583; the ui half of TPL-515, 544.

**`tests-e2e`**
- e2e: TPL-400, 401, 403, 410, 411, 413, 414, 421, 423, 424, 434, 441, 454, 460, 462, 464, 465, 470, 471, 480, 481, 500–507, 509–514, 518, 522–532, 541–543, 546–550, 553–555, 559, 561, 562, 568, 580, 582, 584–593; the e2e half of TPL-420, 431, 515. Changed: TPL-054, 227, 228.
- **Screenshots** for the ready report: the "Done when" journey (TPL-500) attaches Arabic and English shots, with a guide showing and with the handles.

**Manual, never reported as passed:** Windows Alt not focusing the browser's menu, and a drag across a real second monitor. The `defaultPrevented` checks and the off-viewport move are the automated proof.

---

## 6. Decided in the contract

1. **No `role="toolbar"`.** It would promise arrow-key navigation and need a label no doc has. A plain row of named buttons, so no new wording.
2. **The toolbar shares Save's row**, so it adds no height above the area (TPL-590's worry).
3. **Toolbar order:** Undo, Redo, minus, percentage, plus, Fit, flipping with the language; undo and redo icons mirror in Arabic, minus and plus don't.
4. **Fit is a text button, the others icons with tooltips**, since no common icon says "Fit".
5. **Handles aren't in the tab order and have no name** (`aria-hidden`): keyboard resizing stays in the fields, as design § 3 says.
6. **A press selects**, on top of the click, so the handles show at once and a drag of an unselected item needs nothing more. Only the main button.
7. **The focus rule for "designer level":** § 3.5's table. It reads design § 3's "with the selected box focused" and "keys listen at designer level" together: arrows act unless the focus is in a field, a dialog or menu, outside the designer, on another box, or on the size select. So arrows work right after a click on a panel entry, and the clinic tabs keep theirs.
8. **Alt wins over Shift** on arrows. Ctrl + arrows do nothing. `meta` counts as `ctrl`.
9. **Guides:** one line per axis, the nearest. Target order: other items in layout order, then the sheet. A line the sheet's limit moved the box off isn't shown. `data-mm` holds the target's value.
10. **Auto-scroll runs only with the pointer inside the area**, in the 24 px band; past the area's edge it stops. The design's "within 24 px" read literally, and so crossing the panel never scrolls a sheet. A fixed 8 px per frame, not faster nearer the edge.
11. **A panel drag shows no preview box on the sheet:** the ghost and the guide lines. The drop's place comes from `moveBox`.
12. **The ghost's top-left is the pointer**, so the drop's place is what's under the pointer's tip.
13. **A nudge run:** 999 ms joins, 1000 ms starts a new step. A net-zero run leaves no step and no run.
14. **Handle on an off-sheet item:** both rules hold: an item inside the sheet moves only its edges; an item off it comes inside on the first handle drag too, the axis that doesn't move included, since design § 3 says "the first drag".
15. **`HANDLE_SIZE_PX` is 8,** the design's minimum. Eight handles sit centered on the corners and edges; corners only sit fully outside. On a thin box with eight (40 × 4 mm at 50%), `n` and `s` overlap in the middle and the later one wins, by `ALL_HANDLES`.
16. **TPL-550's "18.9 × 7.6 px" for 5 × 4 mm at 50% is 100%'s width;** 50% is 9.45 × 7.6. Same rule, the test uses the true size.
17. **Fit floors to one decimal** so nothing scrolls by rounding. **Area:** measured top, minimum 240 px on a very low window (the page then scrolls).
18. **TPL-587's ≈ 61%** depends on the page's header; the test reads the percentage shown and expects the next multiples of 25.
19. **Undo's off state counts an open field with a real change,** so Undo can be pressed while typing (TPL-581), though no step is recorded yet.
20. **An undo clears all raw text,** the sheet's measures too, not only the item's.
21. **Key repeat** isn't special: a held Delete removes one because nothing is selected after it.
22. **`data-mm` holds the exact target,** a half-tenth center included (75.25), not rounded. **The fit's measure** uses `max(clientWidth, offsetWidth)`, so a scrollbar at 200% doesn't make a second Fit differ from a first. **A committed drag or nudge clears that item's raw text** in X, Y, width and height (TPL-582).
23. **Guide and handle colors:** handles the selected box's `#0f766e`; guides `#db2777`, so they stand out on the mm grid. Neither prints.
24. **Settled by the acceptance run (TPL-591, TPL-592, TPL-593).** The outline stays at about 1 px on screen at any zoom, 2 px selected: the box's inset `box-shadow` spread follows the zoom, so it never thins away at Fit, and being inset it never grows the box. The area's bottom gap is 24 px, matching the page's padding, so a window tall enough for everything has no page scrollbar. The ghost's text follows the zoom: the new item's font × the zoom, as its size does.

## 7. Wording

Nothing new to approve: the five labels are the design's words (§ 3 "Zoom", § 5). English follows the same.
