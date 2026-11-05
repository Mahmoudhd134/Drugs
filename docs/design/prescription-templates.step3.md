# Prescription print templates, step 3: drag

Status: **approved** (user, 2026-11-05). Nothing is built. Builds on the [design](prescription-templates.md) and
step 1's designer and [contract](prescription-templates.contract.md), which is still in review on its own branch. **The build starts after
steps 1 and 2 are merged**: it changes the same designer files as step 1's fixes, step 2 also edits `TemplateSheet.tsx`, and TPL-465 needs step 2's print root.

## 1. Goal

The super admin places items with the mouse and keyboard instead of typing every position.

**Done when:** on an A4 sheet at Fit zoom, the super admin drags a manual input from the panel onto the sheet, drags it until a guide
shows it level with the date, resizes it by its left edge, nudges it 0.1 mm with Alt and an arrow, presses Ctrl+Z twice and Ctrl+Y once, and saves; after a
reload every item is where it was placed, in mm.

## 2. Decisions (user, 2026-11-05)

| # | Decision |
|---|---|
| S1 | **Eight resize handles**, corners and edges. Very small boxes (both sides below 36 screen px) show the corners only |
| S2 | **Snap to 1 mm with alignment guides.** Alt turns both off while dragging |
| S3 | **Undo and redo** for every layout change, by toolbar buttons and shortcuts |
| S4 | **The full keyboard set:** arrows 1 mm, Shift 5 mm, Alt 0.1 mm, Delete, Esc |
| S5 | **Zoom:** minus and plus from 50% to 200%, and Fit. Starts at Fit each time the page opens. Not saved. Fit alone may go below 50%, down to 25%, because A4 at 50% is 561 px tall and doesn't fit a 1280 × 720 laptop |

Carried over: click to add stays; typed mm fields stay and reach 0.1 mm; desktop only; no rotation or multi-select; no new library (own pointer handlers).

## 3. Behaviour

**Dragging from the panel.** A pointer drag past 4 px shows a ghost of the item. Dropped on the sheet, the item is added with its top-left under the ghost, moved in to
stay fully on the sheet, snapped, selected, as one undo step. Dropped outside, or cancelled with Esc, nothing is added. A press with no movement is a click, which
adds as in step 1. Dimmed items and a panel at 50 items can't be dragged.

**Moving.** Dragging an item's box moves it, kept fully on the sheet. Selecting needs no movement: a press alone never changes a position, so an item at 12.3 mm stays there
until it's moved. Esc during a drag puts it back. A lost pointer (`pointercancel`) also puts it back. Moves below 4 px don't count, so a click can't nudge an item.

**Resizing.** The selected item shows eight handles; below 36 × 36 screen px (at the current zoom), corners only. A handle moves only its edges, and the opposite edges stay put. Sizes stop at the
step 1 minimums (width 5 mm, height 4 mm, prescription text height 20 mm) and at the sheet's edge. Handles stay the same size on screen at any zoom, with a target of at least 8 px, and in
the same physical place in both languages.

**Snap.** The moving edge or corner lands on whole mm, measured from the sheet. A move snaps the top-left corner, and the size stays as it is.

**Guides.** While dragging or resizing, an item's left, center and right (and top, middle and bottom) stick to the same lines of the other items and of the sheet, within 1 mm. A line shows across the
sheet where they meet. Guides take priority over the 1 mm snap, so an item can line up with a neighbour at 12.3. Guides don't show or stick with Alt, on keyboard moves, or for dimensions beyond the moving edges.

**Alt** turns snap and guides off for that drag, moving in 0.1 mm steps. All values keep one decimal, compared in tenths (design § 3).

**Keyboard**, with the selected item's box focused:

| Key | Result |
|---|---|
| Arrows | Move 1 mm (from the current value, without rounding to whole mm) |
| Shift + arrows | Move 5 mm |
| Alt + arrows | Move 0.1 mm |
| Delete | Remove the item, except the prescription text; the focus goes to the sheet's scroll area |
| Esc | Deselect, focus staying on the item's box |

Moves stop at the sheet's edge. Arrows are physical: left is left in both languages. In a text or number field all these keys keep their normal behaviour. Resizing by keyboard stays in the number fields.

**Undo and redo.** One step each: an add, a remove, one whole drag, one whole resize, one committed field (blur or Enter), one page-size change with the items it moved, one run of nudges (ends after 1 second without one, or on another action).

- Toolbar buttons, and Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z. While the focus is in a text or number field, the shortcuts stay with the field; the buttons still work on the layout.
- The last 50 steps, until the page is left. A new change after an undo drops the redo steps. Saving doesn't clear history. Removing the template does.
- Undo restores the selection to the item it changed, or clears it if the item is gone.
- **Unsaved changes follow the layout:** back to the saved layout, Save turns off and leaving asks nothing (D16); away from it, both come back.
- Selecting and zooming are not steps.

**Zoom.** A toolbar with minus, the percentage, plus and Fit. Steps of 25%, from 50% to 200%, with buttons turning off at the limits. Fit shows the whole sheet in the area, within 50–200%; a sheet too big for that scrolls. Fit is the start on each opening; changing the window later doesn't re-fit. Changing the page size re-fits. Zoom changes
only the view: every number is still in mm, drags convert screen pixels through the current zoom, and print is untouched.

**Scrolling.** Near the scroll area's edge (within 24 px), a drag scrolls the area by itself, and the item follows the pointer.

**Touch.** Pointer events also work on a tablet at 900 px or wider (`touch-action: none`), but only the mouse is promised and tested.

### Settled by the T0 reviews

These replace anything above that says otherwise.

**Drag mechanics**
- "Past 4 px" is straight-line distance. Only the main button starts a drag. Positions come from the press, not from adding up rounded moves.
- During a drag the layout doesn't change: it runs in a preview state and commits on drop, so a clean template stays clean and Esc leaves nothing behind. A drag that ends on the same layout is no step.
- The `click` after a panel drag or a cancel is swallowed, so a drag never adds a second item.
- The handle set is frozen during a drag, so crossing 36 px can't unmount the handle in use. A missing release (`buttons === 0`, or `lostpointercapture` with no `pointerup`) acts like `pointercancel`: the item goes back.
- A release outside the window ends the drag at the clamped edge. A drop counts only inside both the sheet's and the area's rectangles.
- During a drag only Esc and Alt do anything: Delete, arrows, undo, redo and Tab are swallowed. Esc ends the drag and keeps the selection; a second Esc deselects.
- Dragging an unselected item selects it. Dropped drags leave the box focused, so arrows work at once. Text isn't selected by a drag.

**Geometry**
- Corners-only applies when **both** sides are below 36 px; small boxes get their corners outside the box, so a part of the box always starts a move. Handles live in an unscaled overlay above the sheet, not inside the button or the sheet's clip, so items at the sheet's edge keep a full target. Neither handles nor guide lines print.
- **Guides:** other items' lines and the sheet's edges and center. Exactly 1.0 mm counts. The nearest line wins, and ties stay on the first found. Match before snapping, then apply the sheet's limits last, so at a sheet edge the edge wins over whole mm (x = 107.7 stays flush). Centers compute in half-tenths, then round to one decimal.
- **Alt** means unsnapped, with one decimal stored: one screen pixel is 0.13–0.53 mm, so a mouse can't step 0.1 mm. Exact 0.1 mm comes from Alt + arrows or the fields. Alt can go down or up mid-drag; the value at release counts.
- **Overlap:** the topmost item (later in order) takes the press. A covered item is reached with Tab and Enter. Its handles sit above the covering box. Order never changes.
- An item already off the sheet stays as it is on a press; the first drag or arrow brings it inside; undo restores it.

**Keyboard**
- Keys listen at designer level, not only on a focused box, and use `event.code`, so Ctrl+Z works on an Arabic layout. `preventDefault` applies whenever the designer handles a key, including at the sheet's edge, and to Alt's own keydown and keyup. So Alt + left and right never reach the browser's Back and Forward while a box is selected. With nothing selected, or the focus in a field, they are the browser's, and D16 asks if needed.
- Shortcuts don't run while a dialog or menu is open, or below 900 px.
- After adding by a click the focus stays on the entry, as in step 1, and after a drop it goes to the box. After Delete, Remove or an undo that removes the focused box, it goes to the sheet's area. A toolbar button that turns off passes the focus to the sheet's area.
- Arrows at 200% scroll the area to keep the box visible.

**Undo**
- Whole layouts are stored, with the clock passed in. Item fields gain a commit signal: blur or Enter, except static text, where Enter is a new line and only blur commits. Typing updates a pending value on screen, as now.
- Toolbar Undo with a focused field commits it first, then undoes that. An undo clears server messages and raw field text, and no step comes from a field with no real change.
- Dirty compares against the saved layout. A new sheet that was never saved stays dirty; raw invalid text in a field also keeps Save on and the question. A reload or refetch leaves the draft and history alone.
- Selection after undo or redo: an add's undo clears, its redo selects the item; a remove's undo selects it, its redo clears; a change selects the changed item; a page-size step keeps the selection if the item exists and re-fits.

**Zoom**
- The sheet has a sized wrapper with `transform-origin: 0 0`, so the scroll area matches the scaled size and all four corners are reachable.
- The area takes a fixed height from the window, so Fit isn't measured against its own content. Fit is computed when the sheet first appears, however it appears. Plus and minus from a non-step Fit go to the next multiple of 25, and the percentage shows a whole number.
- Convert screen to mm through the sheet's own `getBoundingClientRect`, and recompute on auto-scroll and wheel. The area stays `dir="ltr"`, so `scrollLeft` is never negative. Esc after an auto-scroll returns the item and leaves the scroll.

**Settled at T5 (user, 2026-11-05), from the acceptance run**
- **Auto-scroll past the edge:** moves and resizes keep scrolling while the pointer is past the area's edge, on that axis. A panel drag scrolls only with the pointer inside the area, so crossing the panel never scrolls the sheet.
- **The selected item stays in view:** after a zoom press, Fit, undo or redo, the selected box is scrolled into view (`nearest`). Nothing else moves the scroll.
- **Save turning off** passes the focus to the sheet's area, like a toolbar button.
- From the same run, within the rules: a box's outline stays about 1 px on screen at any zoom (2 px selected), the area's bottom gap matches the page's padding so no page scrollbar appears, and the ghost's text follows the zoom.

**Step 1's tests and docs that change:** TPL-054, TPL-227 and TPL-228 and their e2e helper (`e2e/support/print-template.ts`) measure at 100%, so they set 100% zoom first; design § 3's "1 mm = 1 CSS mm" becomes "at 100%"; the contract's focus and field rules gain the above.

## 4. Frontend

Frontend only: no route, no table, no migration.

- `dragGeometry.ts` (pure): screen to mm through zoom, snap, guide matching, handle rules, minimums and sheet limits.
- `layoutHistory.ts` (pure): the undo stack, grouping and the saved-layout comparison, with the clock passed in.
- `TemplateDesigner`: pointer handlers with capture on the box or handle, selection, toolbar, keyboard. Positions stay inline styles (the RTL style cache would flip `left`).
- `TemplateSheet`: a CSS `transform: scale()` for zoom, used only in the designer; print renders at 100% through step 2's root.
- **i18n:** `printTemplates.toolbar.*` (undo, redo, zoom in, zoom out, Fit), both locales.
- **Mutation:** `dragGeometry.ts` and `layoutHistory.ts` join the pure-logic list: `PURE_LOGIC` in `vite.config.ts`, `stryker.config.json` and `vitest.stryker.config.ts`.
- **Contract, at this step's T0:** texts, accessible names and test ids for the toolbar, ghost, handles and guides. `src/test` needs `PointerEvent` and `setPointerCapture` stubs if component tests press anything; otherwise those cases stay e2e.

**Tracks:** frontend coder, unit and component test writer, e2e test writer. **Cases:** 139, under the workflow's 150. **Size:** about 1 day is tight, an estimate. If it runs over, **guides split off first** as their own small feature, as agreed.

**Manual cases, not gates:** Windows Alt not focusing the browser menu, and a drag across a real second monitor. CI can't show either. The `defaultPrevented` checks are the automated proof.

## 5. القواعد التشغيلية (للمصمم)

- يسحب مدير المنصة عنصرًا من اللوحة الجانبية إلى الورقة فيُضاف في مكان الإفلات. الإفلات خارج الورقة أو الضغط على Esc لا يضيف شيئًا. والضغط على العنصر دون سحب يضيفه كما كان. العناصر الباهتة لا تُسحب، ولا يُسحب شيء عند الوصول إلى 50 عنصرًا.
- يُحرَّك العنصر بسحبه، ويبقى كله داخل الورقة. Esc أثناء السحب يعيده إلى مكانه. الضغط وحده لا يغيّر مكانه.
- يظهر حول العنصر المختار ثمانية مقابض لتغيير المقاس، وإذا كان طوله وعرضه كلاهما صغيرين جدًا على الشاشة تظهر الأركان فقط. لا ينزل المقاس عن الحد الأدنى ولا يتجاوز حافة الورقة.
- إذا تداخل عنصران فالضغط يختار العنصر الأعلى، ويُوصَل إلى العنصر المغطى بمفتاح Tab ثم Enter.
- الحركة بالفأرة تلتصق بكل مليمتر كامل وبخطوط محاذاة العناصر الأخرى وحواف الورقة ومنتصفها، ويظهر خط عند المحاذاة. خطوط المحاذاة تسبق المليمتر الكامل، وحافة الورقة تسبق الاثنين. مفتاح Alt يلغي ذلك أثناء السحب، فتُحفظ القيمة كما هي بخانة عشرية واحدة.
- لوحة المفاتيح: الأسهم 1 مم، وShift مع الأسهم 5 مم، وAlt مع الأسهم 0.1 مم، وDelete لحذف العنصر (ما عدا نص الروشتة)، وEsc لإلغاء الاختيار. تتوقف الحركة عند حافة الورقة. اتجاه الأسهم واحد في اللغتين. وداخل حقول الكتابة تعمل المفاتيح كالمعتاد.
- **تراجع وإعادة** بزرين في الشريط وبالمفاتيح Ctrl+Z وCtrl+Y وCtrl+Shift+Z، لآخر 50 خطوة، إلى أن تُغادر الصفحة أو يُحذف القالب، ولا يمحوها الحفظ. السحب الواحد خطوة واحدة، وأي تغيير جديد بعد التراجع يلغي خطوات الإعادة. والعودة إلى الشكل المحفوظ تعني أنه لا توجد تغييرات غير محفوظة.
- **التكبير والتصغير** بخطوات 25% من 50% إلى 200%، وزر «ملاءمة» لعرض الورقة كلها، وهو البداية عند كل فتح. لا يُحفظ مع القالب، ولا يؤثر على الطباعة ولا على القياسات.
- عند السحب قرب حافة المساحة تتحرك المساحة وحدها، ويستمر ذلك إذا تجاوز المؤشر الحافة عند تحريك عنصر أو تغيير مقاسه. أما السحب من اللوحة فلا يحرّكها إلا والمؤشر داخلها.
- بعد التكبير أو التصغير أو «ملاءمة» أو التراجع أو الإعادة، تتحرك المساحة ليظهر العنصر المختار.

## 6. Test cases

IDs continue the TPL area, from TPL-400. Sources: § 3 unless noted.

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-400 | Given the panel, when a manual input is dragged onto the sheet and dropped, then exactly one is added where dropped, in mm, selected, inside the sheet | P0 | e2e | § 3 |
| TPL-401 | Given a drag from the panel dropped outside the sheet, or Esc during it, then nothing is added and nothing is unsaved | P1 | e2e | |
| TPL-402 | Given a press on a panel item without moving, then it's added once as in step 1 (TPL-043) | P1 | ui | |
| TPL-403 | Given a dimmed item or 50 items, when a drag starts, then no ghost and nothing added | P1 | e2e | |
| TPL-404 | Given a drop near the sheet's corner, then the whole item is inside the sheet | P1 | unit | |
| TPL-410 | Given an item, when it's dragged, then it moves to the pointer's place in whole mm and reloads there after Save | P0 | e2e | S2 |
| TPL-411 | Given an item at 12.3, when it's pressed without moving or moved under 4 px, then it stays at 12.3 and nothing is unsaved | P1 | e2e | |
| TPL-412 | Given a drag past any edge, then the item stops at the edge | P1 | unit | |
| TPL-413 | Given Esc during a drag, then the item returns, with no undo step and nothing unsaved | P1 | e2e | |
| TPL-414 | Given a `pointercancel` during a drag, then the item returns | P2 | e2e | |
| TPL-420 | Given each of the eight handles, when dragged, then only its edges move and the opposite edges stay | P0 | unit+e2e | S1 |
| TPL-421 | Given a box with both sides below 36 screen px at the current zoom, then corners only; zooming in shows all eight | P1 | e2e | S1 |
| TPL-422 | Given a handle dragged below the minimums (each kind, the prescription text's 20 mm included) or past the sheet, then the size stops there | P1 | unit | S1 |
| TPL-423 | Given a handle at 50% and at 200%, then it's the same size on screen and at least 8 px | P2 | e2e | S1 |
| TPL-424 | Given the Arabic and the English UI, then each handle is in the same physical place and moves the same edge | P1 | e2e | S1 |
| TPL-430 | Given a position at 12.34 after a drag at any zoom, then it never stores more than one decimal, in tenths | P1 | unit | S2 |
| TPL-431 | Given another item's left edge within 1 mm while moving, then it sticks and a line shows; past 1 mm it snaps to whole mm and the line goes | P0 | unit+e2e | S2 |
| TPL-432 | Given each pair of edge and center lines, on both axes, and the sheet's center, then each one sticks | P1 | unit | S2 |
| TPL-433 | Given guides while resizing, then only the moving edges stick | P1 | unit | S2 |
| TPL-434 | Given Alt held during a drag, then no guide and no whole-mm snap, with one decimal stored | P1 | e2e | S2 |
| TPL-435 | Given only one item on the sheet, then its sheet guides work and nothing fails | P2 | unit | S2 |
| TPL-440 | Given a selected item, when arrows, Shift + arrows or Alt + arrows are pressed, then it moves 1, 5 or 0.1 mm from its current value, in tenths | P0 | ui | S4 |
| TPL-441 | Given the Arabic UI, then the left arrow moves left | P1 | e2e | S4 |
| TPL-442 | Given the sheet's edge, then arrows stop there | P1 | unit | S4 |
| TPL-443 | Given Delete on a manual input, then it goes and the focus is in the sheet's area; on the prescription text, nothing happens | P1 | ui | S4 |
| TPL-444 | Given Esc on a selected item, then it's deselected and the focus stays | P2 | ui | S4 |
| TPL-445 | Given the focus in a number or text field, then arrows, Delete, Esc and the shortcuts keep their normal behaviour | P0 | ui | S4 |
| TPL-450 | Given an add, remove, drag, resize, committed field, or page-size change, when undone and redone, then the layout is exactly as before, one step each | P0 | unit | S3 |
| TPL-451 | Given several nudges in a row, then one undo step; after 1 second or another action, a new one | P1 | unit | S3 |
| TPL-452 | Given 51 changes, then 50 can be undone and the buttons turn off at the end | P2 | unit | S3 |
| TPL-453 | Given an undo and then a new change, then redo is empty | P1 | unit | S3 |
| TPL-454 | Given Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z, then they work with the focus on the sheet; in a field the field's own undo runs, and the buttons still undo the layout | P1 | e2e | S3 |
| TPL-455 | Given changes undone back to the saved layout, then Save turns off and leaving asks nothing; a redo brings both back | P0 | ui | S3, D16 |
| TPL-456 | Given a save and then an undo, then Save is on: the saved layout is the new reference | P1 | ui | S3 |
| TPL-457 | Given a removed item brought back by undo, then its id, name and place are the same, and it's selected | P1 | unit | S3 |
| TPL-458 | Given selecting or zooming, then no undo step | P1 | ui | S3 |
| TPL-459 | Given the template removed, then the history is empty | P2 | ui | S3 |
| TPL-460 | Given A5 and A4, then Fit shows the whole sheet on opening, at 1280 × 720 too (below 50% when needed, not below 25%) | P1 | e2e | S5 |
| TPL-461 | Given minus and plus, then 25% steps from 50% to 200%, turning off at the limits | P1 | ui | S5 |
| TPL-462 | Given a drag at 50%, 100% and 200%, then the item lands under the pointer, with the same mm for the same sheet point | P0 | e2e | S5 |
| TPL-463 | Given any zoom, then the settings panel's mm are unchanged and the saved layout holds no zoom | P1 | ui | S5 |
| TPL-464 | Given a page-size change, then the sheet re-fits; given a window resize, then the zoom stays | P2 | e2e | S5 |
| TPL-465 | Given a template saved while viewing at 200%, when printed, then the sheet is true size | P1 | e2e | S5 |
| TPL-470 | Given a drag near the area's edge on a large custom sheet, then the area scrolls and the item follows | P1 | e2e | |
| TPL-471 | Given a drag from the panel across a scrolled sheet, then the drop position counts the scroll | P1 | e2e | |
| TPL-480 | Given the toolbar's buttons, then each has an accessible name and tooltip in both languages, and axe and the cut-text check pass | P1 | e2e | test rules |
| TPL-481 | Given a whole template built with the keyboard alone, then it saves | P1 | e2e | a11y |
| TPL-482 | Given below 900 px, then still the desktop-only message, with no sheet, box or handle in the page | P2 | ui | D12 |

### Edge cases (T0 review)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-500 | Given A4 at Fit, when a manual input is dragged from the panel, dragged until a guide shows it level with the date, resized by its left edge, nudged by Alt + arrow, then Ctrl+Z twice, Ctrl+Y once and Save, then after a reload each item is at the expected mm and the left-edge handle existed at that zoom (40 × 8 mm at 50% is 75.6 × 15.1 px) | P0 | e2e | § 1 Done when, C2 |
| TPL-501 | Given a drag from the panel dropped on the sheet, then exactly one item exists at whole mm, one undo removes it, and the `click` following the release doesn't add a second at the cascade place (`TemplateSidePanel.tsx:26-28`) | P0 | e2e | § 3, code |
| TPL-502 | Given a panel drag past 4 px, when it returns to the same entry and is released, or Esc is pressed and the button released over the entry, then nothing is added, nothing is unsaved, no ghost remains | P1 | e2e | § 3, code |
| TPL-503 | Given a press on an entry, when moved 3 px and released, then one item at the cascade place, no ghost; moved 4 px, the same; moved 5 px, a ghost shows. The same three distances on a box: unchanged, unchanged, moved. Diagonal (3, 3) = 4.24 px counts as past | P1 | e2e | § 3 U5 |
| TPL-504 | Given a right or middle press on an entry, a box or a handle, when moved past 4 px and released, then no ghost, no move, no resize, nothing added | P1 | e2e | gap |
| TPL-505 | Given 200% with the sheet wider than its area, when a panel drag is dropped over the settings panel, where the sheet's scrolled part lies hidden behind it, then nothing is added (the sheet's rectangle alone would say "on the sheet") | P1 | e2e | § 3 |
| TPL-506 | Given a panel drag, when dropped 1 px outside the sheet inside the area's padding, then nothing is added; 1 px inside the right edge, then added and moved in, fully on the sheet | P2 | e2e | § 3 |
| TPL-507 | Given a drop from the panel, then the new box has the focus and an arrow nudges it at once | P1 | e2e | gap, S4 |
| TPL-508 | Given 49 items, when one is added, then the info alert shows and the entries are disabled; undo: 49, entries enabled, a drag works again; redo: 50, disabled again | P1 | ui | § 3, `TemplateSidePanel.tsx:24,53` |
| TPL-509 | Given Alt held during a panel drag, then the drop isn't snapped and holds one decimal; guides don't stick | P2 | e2e | S2 |
| TPL-510 | Given an item drag, when the pointer leaves the window (another monitor) and is released there, then the item is at the clamped edge, one undo step, no drag left running. Real second monitor: manual; CI moves to coordinates outside the viewport (not verified that Playwright delivers them) | P1 | e2e | gap, § 3 U8 |
| TPL-511 | Given a panel drag released outside the window, then nothing is added and the ghost goes | P1 | e2e | § 3 |
| TPL-512 | Given a drag whose release was missed (Alt+Tab, released in another app), when the pointer returns with no button down (`buttons === 0`), then the item goes back, no step, it doesn't stick to the pointer; `lostpointercapture` with no `pointerup` does the same | P1 | e2e | gap, § 3 |
| TPL-513 | Given a `pointercancel` during a resize, then the box is back exactly; during a panel drag, nothing added and no ghost | P2 | e2e | § 3 (TPL-414 covers moves) |
| TPL-514 | Given a drag in progress, when the designer unmounts (session lost, another tab's logout), then no ghost, no console error, `user-select` restored, no pointer listeners left | P2 | e2e | D16, `contract.md:389-392` |
| TPL-515 | Given a clean template and a selected, focused box, when Alt+ArrowLeft or Alt+ArrowRight is pressed, then `defaultPrevented`, the item moves 0.1 mm, the URL stays and no guard question shows. E2e asserts the URL with real history behind; it may pass vacuously if headless doesn't run browser accelerators, so the ui half asserting `defaultPrevented` is the proof | P0 | ui+e2e | S4 |
| TPL-516 | Given Alt+arrow with the focus in a field, on an unselected box, or with nothing selected, then it isn't handled (`defaultPrevented` false, nothing moves), so the browser's Back runs and D16 asks when dirty | P1 | ui | § 3 (fields), D16 |
| TPL-517 | Given an Alt drag or Alt nudge, then the Alt `keydown` and `keyup` are `defaultPrevented` while the box has the focus or a drag runs, and the next arrow still nudges. Whether this stops Windows Chrome's menu focus is a manual case: CI has no browser menu | P1 | ui | gap, § 3 U8 |
| TPL-518 | Given a drag, when Alt goes down mid-way, then the next move is unsnapped; when it goes up, the next move snaps again and guides return; a release while Alt is held stores the unsnapped value | P1 | e2e | S2 |
| TPL-519 | Given the focus on a box, when Ctrl+Z, Ctrl+Y or Ctrl+Shift+Z is pressed on an Arabic keyboard layout (`key` «ئ» or «غ», `code` KeyZ or KeyY) or with Caps Lock (`key` "Z"), then undo or redo runs and `defaultPrevented` | P1 | ui | S3, Arabic |
| TPL-520 | Given steps in history, when a shortcut is pressed with the focus on a panel entry, the area, a toolbar button, the page-size combobox or `body` (a focused box just left), then it runs; in any `input`, `textarea` or contenteditable it doesn't | P1 | ui | S3, step3.md:61 |
| TPL-521 | Given the delete question, the D16 question or the page-size menu open, when a shortcut is pressed, then the layout behind doesn't change | P1 | ui | gap |
| TPL-522 | Given a drag on a clean template, when the page is reloaded, then no leave prompt and no half-done position is saved. Given the box focused, Ctrl+A changes nothing in the layout | P2 | e2e | D16 |
| TPL-523 | Given a drag or resize of a selected item, when Delete is pressed, then it's ignored: the item stays, the drag continues | P1 | e2e | gap |
| TPL-524 | Given a resize, when Esc is pressed, then x, y, w and h are exactly as before, no step, nothing unsaved, guides gone | P1 | e2e | § 3 (TPL-413 covers moves) |
| TPL-525 | Given a drag, when Ctrl+Z or Ctrl+Y is pressed, then history is unchanged, the drag continues, and a later Esc returns to the press position | P1 | e2e | gap |
| TPL-526 | Given a drag, when an arrow is pressed, then the item doesn't jump and the area doesn't scroll | P2 | e2e | gap |
| TPL-527 | Given a selected item in a drag, when Esc is pressed, then the drag ends and the selection stays; a second Esc deselects. With the button still held, moving doesn't restart the drag, and the release changes nothing | P1 | e2e | § 3 |
| TPL-528 | Given a drag, when Tab then Enter reach Save, undo or the page-size field, then no request holds a mid-drag position and the page size doesn't change: Tab is swallowed during a drag | P2 | e2e | gap |
| TPL-529 | Given a Save in flight (delayed route), when a drag ends before the answer, then the item stays, Save is on and leaving asks: the baseline is what was sent (`TemplateDesigner.tsx:180-184`) | P2 | e2e | TPL-242 |
| TPL-530 | Given a clean template in a drag, before the release, then Save stays off and after Esc nothing was ever unsaved | P2 | e2e | § 3, TPL-413 |
| TPL-531 | Given a drag, when the wheel scrolls the area and the button is released with no pointer move, then the item lands under the pointer, counting the new scroll | P1 | e2e | § 3 |
| TPL-532 | Given a drag, when the browser's Back runs (`page.goBack`, a mouse's back button), then the drag ends with the item back, and the guard answers on the layout before the drag: clean leaves, dirty asks; staying leaves nothing stuck to the pointer | P2 | e2e | D16 |
| TPL-533 | Given x = 12.3 and a +10 px move, when computed at each zoom, then with Alt and with snap (table): 50%: 17.6, 18; 75%: 15.8, 16; 100%: 14.9, 15; 125%: 14.4, 14; 150%: 14.1, 14; 175%: 13.8, 14; 200%: 13.6, 14. Also the same at Fit's non-step zoom (61.5%), one decimal only | P1 | unit | S2, S5, design § 3 |
| TPL-534 | Given x = 12.3, w = 40, when the left edge is dragged to 11.2, then x = 11, w = 41.3, and the right edge stays 52.3 in tenths; the right edge snaps likewise; a corner on both axes | P1 | unit | step3.md:40 |
| TPL-535 | Given w = 40.3, when moved, then w is exactly 40.3 throughout and after the drop | P1 | unit | step3.md:40 |
| TPL-536 | Given w = 40.3 on A5, when dragged past the right edge, then x = 107.7 (flush: the edge beats whole mm; 108 would be off the sheet, 107 leaves a gap). Given right edge 52.3, when the left handle crosses it, then x = 47.3, w = 5, no flip | P1 | unit | step3.md:33,37,40 |
| TPL-537 | Given a neighbour's left at 12.3, then a moving left edge at 13.3 sticks (exactly 1.0 mm), at 13.4 doesn't and snaps to 13. With two lines in range, the nearest wins; a tie is stable | P1 | unit | step3.md:42, § 3 U4 |
| TPL-538 | Given a neighbour's line within 1 mm, when an arrow moves the item, then it moves exactly 1 mm from the current value, with no stick and no line | P1 | ui | step3.md:43 |
| TPL-539 | Given w = 5.1 and a center line at 74, then x rounds by `roundTenth` (71.45 → 71.5) and stores one decimal. Given a custom sheet 150.5 wide, its center 75.25 compares in tenths without failing | P1 | unit | design § 3 Numbers |
| TPL-540 | Given 100 presses of Alt + arrow from 12.3, then 22.3 exactly in the layout and in the request. From 107.5 with a max of 107.7, one arrow lands on 107.7. Already at the edge: no change, no step, nothing unsaved | P1 | unit | S4, step3.md:57 |
| TPL-541 | Given a drag done in 50 small moves and the same drag in one, then the same mm: positions come from the press, not from adding up rounded moves | P1 | e2e | S2 |
| TPL-542 | Given a drag past 4 px that returns and ends on the same layout (a whole-mm item), then no step and nothing unsaved. Given x = 12.3, the same gesture lands on 12 and is one step | P1 | e2e | § 3 |
| TPL-543 | Given Windows display scaling (`deviceScaleFactor` 1.25 and 1.5) and browser zoom, when dragged, then the item lands under the pointer with the same mm | P2 | e2e | S5 |
| TPL-544 | Given an item partly past the sheet (from a hand-made layout via MSW, or X = 140 typed, applied uncorrected per `contract.md:600`), when pressed without moving, then it's unchanged and Save still refuses; when dragged, it comes inside on the first move; when an arrow is pressed, it lands at the nearest inside position; undo restores the off-sheet value | P1 | unit+ui | § 3, TPL-224 |
| TPL-545 | Given a typed width of 1, 0 or −5, then the handles don't compute a broken box; a handle drag gives at least the minimum | P2 | unit | § 3, `contract.md:600` |
| TPL-546 | Given two overlapping items, when the overlap is pressed, then the later in item order (the one on top) is selected and moves; order doesn't change, and Save sends the same order (`layout.ts:369`) | P1 | e2e | design § 3, gap |
| TPL-547 | Given an item flush with each sheet edge and corner, then every handle shows its full 8 px target and can be dragged, inward included; given a selected item under another, its handles stay above the covering box (`TemplateSheet.tsx:64` clips the sheet) | P1 | e2e | step3.md:37, C3 |
| TPL-548 | Given items, then only the selected one shows handles; none after Esc or Delete; handles aren't inside the button (axe `nested-interactive`), and neither they nor guide lines appear in print | P1 | e2e | § 3, `TemplateSheet.tsx:74` |
| TPL-549 | Given a fully covered item, when reached by Tab and Enter, then it's selected, arrows move it and its handles work: the only way to it without moving the cover | P1 | e2e | gap |
| TPL-550 | Given 5 × 4 mm and 40 × 4 mm boxes at 50% (18.9 × 7.6 and 75.6 × 7.6 px, thinner than an 8 px handle), then a part of the box still starts a move, and the handles' order of priority is stable | P1 | e2e | step3.md:37 |
| TPL-551 | Size rule table (mm, zoom → handles): 5 × 4, 100% → 4; 9 × 9, 100% (34 px) → 4; 10 × 10, 100% (37.8 px) → 8; 40 × 8, 50% (75.6 × 15.1 px) → 8 | P1 | unit | S1, C2 |
| TPL-552 | Given a selected box, when Shift, Ctrl or Alt + arrows are pressed, then w and h never change; typing in the width and height fields does change them | P1 | ui | step3.md:57 |
| TPL-553 | Given a long text overflowing its box (`TemplateSheet.tsx:104-116`), when the overflow is pressed, then that item is selected and moved, even over a neighbour | P2 | e2e | TPL-239 |
| TPL-554 | Given 50 items on A4, when one is dragged, guides stick, then undo, redo and Save work, and the panel stays disabled | P2 | e2e | design § 3 limits |
| TPL-555 | Given A selected, when B, unselected, is dragged, then B is selected with handles and A's handles go. Esc during it: B back, selection stays B, since selecting is no step and `TemplateSheet.tsx:80` selects on click | P1 | e2e | step3.md:33 |
| TPL-556 | Given A selected and the focus tabbed to unselected B, when an arrow is pressed, then nothing moves and it isn't `defaultPrevented` (the area may scroll); Enter selects B. Given a selected, focused box, arrows are `defaultPrevented` also at the sheet's edge | P1 | ui | step3.md:47 |
| TPL-557 | Focus table: Esc → the box; Delete → the area; settings' Remove → the area; undo removing the focused box → the area; panel click → the entry (contract); the last undo by a focused toolbar button, which turns off → not lost to `body` | P1 | ui | step3.md:54-55, `contract.md:285` |
| TPL-558 | Given nudges, when another item is selected, Save runs, or an undo runs within the second, then the next nudge is a new step. Right then left within a run, net zero: no step left | P1 | unit | step3.md:59 |
| TPL-559 | Given a press or drag on a box or handle, then the box has the focus afterwards, so arrows work with no extra click (a `preventDefault` on `mousedown` would break this) | P1 | e2e | step3.md:47 |
| TPL-560 | Given Delete held (key repeat), then one item goes; a repeat on the area does nothing. Backspace removes nothing | P2 | ui | step3.md:54 |
| TPL-561 | Given 200%, when arrows take a box past the visible area, then the area scrolls to keep it visible | P2 | e2e | gap |
| TPL-562 | Given a press or drag on an entry, box or handle, in both languages, then the page's selection stays collapsed, and text in a field can still be selected afterwards | P2 | e2e | gap |
| TPL-563 | Given fields, when tabbed through with no change, or typed and undone natively back to the start, or 12.34 typed on 12.3, then no undo step | P1 | ui | step3.md:59 |
| TPL-564 | Given a static text field, when Enter is pressed, then a new line and no step; on blur, one step (C6). A name field: blur or Enter, one step however many keys were typed | P1 | ui | step3.md:59, `contract.md:329` |
| TPL-565 | Given "abc" in A's X (a raw input), when undo removes A or restores X, then the raw input goes, Save isn't left blocked with no visible message, and the dirty state follows (`TemplateDesigner.tsx:102,166`; `removeSelected` already purges at :136) | P1 | ui | code |
| TPL-566 | Given a layout saved at B after A, when undone to A, then Save on and leaving asks; when redone to B, then Save off, leaving asks nothing, `beforeunload` gone. Given Save at A after that undo, redo to B: Save on, history kept | P1 | ui | S3, D16 |
| TPL-567 | Given changes undone to the saved layout, then each exit kind asks nothing: a tab (blocker), Back, logout (`confirmLeave()`), and no `beforeunload` listener; a raw input elsewhere keeps Save on and the question | P1 | ui | D16, `useUnsavedGuard.ts:32-61` |
| TPL-568 | Given history and a changed zoom, when leaving (D16 confirmed) and returning, or reloading, then undo and redo are off and the zoom is at Fit. The D16 question cancelled: history, selection and zoom unchanged | P1 | e2e | step3.md:62, S5 |
| TPL-569 | Given a new sheet (`baseline` null), when an item is added and undone, then Save stays on and leaving asks (C7); after the first save, an undo: Save on | P1 | ui | `contract.md:341` |
| TPL-570 | Given history, when the query refetches and answers another layout (an invalidation, another tab's save), then draft, baseline, selection and history don't change, and undo uses the local steps | P1 | ui | `contract.md:339` |
| TPL-571 | Given clinic A with history, when going to clinic B (`ClinicPage.tsx:87`), then B's undo is off and Ctrl+Z changes nothing. The same for leaving to the Staff tab and back | P1 | ui | TPL-245 |
| TPL-572 | Given a failed Save with `items[2].name` named, when undone so the indexes shift, then the message doesn't land on another item (`TemplateDesigner.tsx:221`): an undo clears server messages, like an edit (:110) | P2 | ui | code |
| TPL-573 | Given the delete cancelled or failed, then history stays. Given success then «إنشاء قالب», both buttons are off | P2 | ui | step3.md:62 |
| TPL-574 | Given history and the window narrowed below 900 px, then shortcuts and Delete change nothing behind the message; widened, history and selection are as before (TPL-229) | P2 | ui | D12 |
| TPL-575 | Given a language change, then history stays, undo works, the sheet doesn't mirror (TPL-234) | P2 | ui | S3 |
| TPL-576 | Given a removed item brought back, then it's at its old index (paint order) and, with nothing else changed, Save is off (`layout.ts:369` is order-sensitive) | P1 | unit | S3, D16 |
| TPL-577 | Selection table: undo of an add → cleared; redo of an add → the item; undo of a remove → the item; redo of a remove → cleared; undo of a change to A with B selected → A; undo or redo of a page size → the selection kept if it exists | P1 | unit | step3.md:63 |
| TPL-578 | Given more than 50 changes since the load, when all 50 are undone, then the saved layout is out of reach: Save stays on and leaving asks | P2 | unit | step3.md:62 |
| TPL-579 | Given a page-size change that moved and shrank items, when undone, then each is exact (unlike going back by the select, TPL-223) and the sheet re-fits. The same size committed or an invalid measure: no step, no re-fit | P1 | ui | step3.md:59,67 |
| TPL-581 | Given typed text in a focused field, when the toolbar's Undo is clicked, then blur commits first, the undo reverts that commit, and the field shows the layout's value, not the typed text (`MmField.tsx:38`) | P1 | ui | step3.md:61 |
| TPL-582 | Given X focused with typed text, when the box is dragged, then the field shows the new X afterwards | P1 | e2e | `MmField.tsx:38` |
| TPL-583 | Given a Save in flight, when undo runs, then the answer sets the baseline to what was sent, the layout stays undone, and Save is on | P2 | ui | TPL-242 |
| TPL-580 | Given 420 × 600 mm at Fit, then Fit is below 50%, minus off, plus goes to 50%, the area scrolls both ways when the sheet is larger than the area, and at 200% on A4 all four corners are reachable by scroll in both languages (a centered `transform-origin` would put the left part beyond scroll's reach) | P1 | e2e | step3.md:67 |
| TPL-584 | Given 50%, then the area has no leftover scroll from the unscaled size (the wrapper at `TemplateDesigner.tsx:259` is `fit-content`, and a transform doesn't change layout size) | P1 | e2e | C1 |
| TPL-585 | Given a drag with the pointer held still in the 24 px band, then the area keeps scrolling, the item follows with no pointer move, and it stops at the end. Esc: the item is back, the scroll stays | P1 | e2e | step3.md:70 |
| TPL-586 | Given the Arabic UI at 200%, then the area is still `dir="ltr"` (`TemplateDesigner.tsx:249`, `contract.md:286`), `scrollLeft` ≥ 0, auto-scroll right raises it, and the same sheet point gives the same mm as in English | P1 | e2e | RTL |
| TPL-587 | Given Fit at a non-step value (A5 at 1280 × 720: ≈ 61% if height is the limit), when plus or minus is pressed, then the next multiple of 25 (75, 50); the percentage shows a whole number | P1 | e2e | C4 |
| TPL-588 | Given each way the sheet first appears (load, «إنشاء قالب» from the empty state, widening from below 900 px), then Fit is computed then, from a measured area, not 0 | P1 | e2e | step3.md:67 |
| TPL-589 | Given a panel drag entering the 24 px band from the panel's side (the left in English, the right in Arabic) on a scrollable sheet, then the drop counts the scroll at the drop | P2 | e2e | step3.md:70 |
| TPL-590 | Given 1280 × 720 and the page not scrolled, when a drag reaches the area's bottom, then the band can be reached in the window and it scrolls (not measured: `maxHeight` assumes 200 px above the area, and the zoom toolbar adds height) | P2 | e2e | `TemplateDesigner.tsx:252` |
| TPL-591 | Given A4 at Fit on a laptop and at 25%, then every box's outline shows all round: about 1 px on screen at any zoom, 2 px selected, with the box's size exact | P1 | e2e | Acceptance #1 |
| TPL-592 | Given a window tall enough for everything (1920 × 970), then the page has no scrollbar, and the area's bottom is inside the window | P2 | e2e | Acceptance #8 |
| TPL-593 | Given a panel drag at 50% and at 200%, then the ghost's text is the item's font × the zoom | P2 | e2e | Acceptance #11 |
| TPL-594 | Given a move or a resize with the pointer past the area's edge, then the area keeps scrolling on that axis and the item follows; given a panel drag with the pointer over the side panel on a scrolled sheet, then the area doesn't scroll | P1 | unit+e2e | User, T5 (acceptance #3) |
| TPL-595 | Given a selected item out of view after a zoom press, Fit, undo or redo, then the area scrolls so its box shows; with nothing selected the scroll stays | P1 | ui+e2e | User, T5 (acceptance #2) |
| TPL-596 | Given the focus on Save, when a save makes it turn off, then the focus is in the sheet's area, not on `body`; a Save refused by the rules keeps it on and the focus stays | P2 | ui | User, T5 (acceptance #9) |
