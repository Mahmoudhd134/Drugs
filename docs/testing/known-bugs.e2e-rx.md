# Known bugs: e2e track, RX journeys (M1.6.8, stage 2: the prescription builder)

Found by the Playwright specs of `ClinicHub.Web/e2e/prescription/`; to be folded into [known-bugs.md](known-bugs.md).
Each one has a `test.fixme("BUG-<id>: …")` naming the cases it proves. ID range: BUG-570 to BUG-584.

| ID | Case IDs | Doc line (link + quote) | What happens | How to reproduce | Severity |
|---|---|---|---|---|---|
| BUG-570 | UX-036 (found by RX-075) | [M1.6 design § D3](../design/m1.6-test-foundation.md#d3-test-stack-and-layout): "Every page visited also checks: … an axe-core scan (serious/critical violations fail the full tier)" | The «تعديل قبل النسخ» / "Edit before copying" dialog's Quill toolbar: its icon buttons (bold, italic, underline, numbered list, bulleted list, direction, clear formatting) have no accessible name: axe `button-name` (critical); the alignment picker's label (`.ql-picker-label`, `role="button"`) neither: `aria-command-name` (serious). (`features/prescription/components/EditorContent.tsx`, react-quill's default toolbar.) | As any clinic user add a drug on `/`, click «تعديل ونسخ», run axe (WCAG 2.1 A/AA) once the editor shows. Test: `e2e/prescription/editor-axe.spec.ts` "BUG-570" (fails in every project when unmarked); RX-075's own page check leaves `.ql-toolbar` out (`support/rx.ts` `expectEditorHealthy`). | P1 |
