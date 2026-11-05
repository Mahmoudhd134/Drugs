# Prescription print templates: test cases

Status: **approved** (user, 2026-11-05). Same format and rules as the
[test catalog](../testing/test-catalog.md). New area **TPL**. Sources: the [design](prescription-templates.md) (§ / Dn) and the
[business file](prescription-templates.business.md) («…»). Moved into the catalog with each step. Steps 3 and 4 get their
cases at their own T0. Examples: clinics A and B; a valid layout L (A5, one prescription text, one manual input «الاسم», one
full date).

## Step 1: template designer, no drag

### Admin API

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-001 | Given clinic A with no template, when the super admin GETs its template, then 204 | P0 | api | § 5 |
| TPL-002 | Given L, when the super admin PUTs it for A and GETs it back, then 200 with the same page and items in the same order | P0 | api | § 5 |
| TPL-003 | Given A has a template, when the super admin PUTs another layout, then it replaces the first and A still has one row | P0 | api | D4 |
| TPL-004 | Given A has a template, when the super admin DELETEs it, then 204 and GET answers 204 | P0 | api | § 5 |
| TPL-005 | Given A has no template, when the super admin DELETEs, then 204 | P2 | api | § 5 |
| TPL-006 | Given templates saved for A and B, when each is read, then each answers its own layout; writing A's leaves B's unchanged | P0 | api | D4, clinic scoping |
| TPL-007 | Given a clinic-context token (the Owner's too) or no token, when it calls any admin template route, then 403 `forbidden` or 401 | P0 | api | D5 |
| TPL-008 | Given a missing, deleted or template clinic id, when the super admin calls any admin template route, then 404 `notFound` | P0 | api | § 5 |
| TPL-009 | Given a suspended clinic, when the super admin saves its template, then 200 | P2 | api | § 5 |
| TPL-010 | Given a new clinic created from the template clinic, when its template is read, then 204 | P1 | api | D6 |

### Validation (server)

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-020 | Given a layout with no prescription text or with two, when saved, then 400 `templateTextCount` and nothing is stored | P0 | unit+api | D7, § 3 |
| TPL-021 | Given an unknown `kind`, an unknown `function`, an unknown `schemaVersion` or a duplicate item id, when saved, then 400 `templateLayoutInvalid` | P1 | unit+api | § 5 |
| TPL-022 | Given a selectable-later kind (`internalData`, `expression`), when saved, then 400 `templateLayoutInvalid` | P1 | unit | § 3 |
| TPL-023 | Given A5 or A4 with sizes that don't match them, an unknown size, or a custom size outside 50–420 × 50–600 mm (49, 50, 420, 421 and 49, 50, 600, 601), when saved, then outside values are 400 `templatePageInvalid` and the borders pass | P1 | unit | § 3, D13 |
| TPL-024 | Given an item ending exactly on the sheet's edge, then it passes; 0.1 mm past the edge, or a negative X or Y, then 400 `templateItemOutsidePage` | P1 | unit | § 3 |
| TPL-025 | Given width 4.9 / 5, height 3.9 / 4, prescription text height 19.9 / 20, then below 400 `templateItemSizeInvalid` and at the limit it passes | P1 | unit | § 3 |
| TPL-026 | Given font size 5.9 / 6 / 36 / 36.1, then outside is 400 `templateFontSizeInvalid` and the borders pass | P1 | unit | D15 |
| TPL-027 | Given an empty or only-spaces name on a manual input or function, then 400 `nameRequired` | P1 | unit | § 3, § 5 |
| TPL-028 | Given a name of 60 and of 61 characters, then 61 is 400 `nameTooLong` | P2 | unit | § 3, § 5 |
| TPL-029 | Given two items named «الاسم» and « الاسم », or "Age" and "age", then 400 `templateItemNameTaken` | P1 | unit | § 3 |
| TPL-030 | Given static text empty or only spaces, then 400 `templateStaticTextRequired`; 1,000 characters pass and 1,001 are 400 `templateStaticTextTooLong`; line breaks are kept | P1 | unit | D9 |
| TPL-031 | Given 50 items pass, and 51 are 400 `templateTooManyItems` | P2 | unit | § 3 |
| TPL-032 | Given a name with a bidi override or control character, then 400 `nameInvalid`; given static text with one (a line break or tab excepted), then 400 `invalidText` | P1 | unit | § 5 |
| TPL-033 | Given a body that isn't a layout (malformed JSON, missing `page`), then 400 `invalidRequest` | P2 | api | Errors |

### Designer

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-040 | Given a clinic page, when the super admin opens it, then the tab «قالب الطباعة» is listed after Staff and opens at its own URL | P1 | ui | § 6 |
| TPL-041 | Given no template, when the tab opens, then the empty state with «إنشاء قالب»; pressing it shows an A5 sheet holding only the prescription text, not saved yet | P0 | ui | § 6 |
| TPL-042 | Given the panel, then it lists manual input, the six functions and static text, and internal data and JS expression dimmed, not addable, with an explanation | P0 | ui | D8, § 3 |
| TPL-043 | Given the panel, when an item is clicked, then it appears on the sheet, selected, with its config, and its type shown as information, not as a control | P0 | ui | D8 |
| TPL-044 | Given a selected item, when its X, Y, width, height or font size is typed, then the sheet updates at once (the true scale: TPL-228) | P0 | ui | § 3 |
| TPL-045 | Given the prescription text selected, then the config has no name and no remove action | P1 | ui | D7 |
| TPL-046 | Given a manual input selected, when it's removed, then it leaves the sheet and the selection clears | P1 | ui | § 3 |
| TPL-047 | Given A5, when A4 or custom is chosen, then the sheet resizes, items keep their mm; going to a smaller size moves any item that would fall off back onto the sheet | P1 | ui | D13 |
| TPL-048 | Given invalid values (each rule of TPL-023–031), when Save is pressed, then the messages show on the selected item's fields (TPL-238), no request is sent, and the rules match the server's (shared cases) | P1 | ui | § 5 |
| TPL-049 | Given a valid layout, when Save is pressed twice quickly, then one request and one «تم حفظ القالب» | P1 | ui | double clicks |
| TPL-050 | Given unsaved changes, when closing or reloading the page, then the browser's prompt shows; after a save it doesn't. Exits inside the app: TPL-232, TPL-247, TPL-248 | P1 | ui | D16 |
| TPL-051 | Given a saved template, when the page reloads, then the sheet shows it as saved, in order | P0 | e2e | § 5 |
| TPL-052 | Given a saved template, when «حذف» is confirmed, then the empty state shows; Cancel keeps it; a destructive dialog starts on Cancel | P1 | ui | «القواعد» |
| TPL-053 | Given a width below 900 px (899), then the tab shows «افتح هذه الصفحة من جهاز كمبيوتر.» and no designer; at 900 the designer | P1 | ui+e2e | D12 |
| TPL-054 | Given Arabic and English UI, then the X and Y mean the same physical place in both; the panel and config flip with the language and the sheet does not | P1 | e2e | § 3 |
| TPL-055 | Given names and static text in Arabic and in English, then each shows in its own direction on the sheet and in the config | P2 | ui | § 3 |
| TPL-056 | Given the designer in Arabic, English, and at desktop width, then axe and the cut-text check pass | P1 | e2e | test rules |
| TPL-057 | Given every control of the designer, then each has an accessible name, and an item can be added, selected and placed with the keyboard alone | P1 | ui | a11y |
| TPL-058 | Given a saved template, when a save fails with a network error or 500, then the error message shows, the edits stay on screen and Save works again | P1 | ui | dialogs contract |

### Edge cases

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-200 | Given a database at the migration before it, when `AddPrescriptionTemplates` runs up, down and up, then the table exists with `Layout` of type `text` and a unique `ClinicId`, and no other table's rows change | P1 | api | D2, § 5 |
| TPL-201 | Given a saved template, when it's saved again after the clock advances, then the same row `Id` and `CreatedAt`, and `UpdatedAt` moves | P2 | api | § 5 |
| TPL-202 | Given A has a valid template, when an invalid layout is PUT (any `template*` code), then 400 and GET still answers the earlier layout unchanged | P1 | api | § 5 |
| TPL-203 | Given an item carrying an extra property (`"script": "x"`) or another kind's field (`text` on a prescription text, `name` on a static text), when saved, then GET answers without them: only the DTO's fields are stored | P1 | api | § 5 |
| TPL-204 | Given a wrong type (`fontSizePt: "big"`, `xMm: "a"`, `items: "x"`), when saved, then 400 `invalidRequest` naming the field, and a stored template is unchanged. An unknown `kind` stays `templateLayoutInvalid` (TPL-021), so `kind` can't be a binding error | P2 | api | ERR-011, § 5 |
| TPL-205 | Given a malformed body, when sent for a missing clinic, then 404 `notFound`; when sent with a clinic-context token, then 403 `forbidden` | P2 | api | platform-admin tech (`AdminClinicFilter`), ACC-033 |
| TPL-206 | Given A has a template, when A is suspended and activated, then the template is unchanged; while suspended, the super admin's GET answers 200 and DELETE 204 | P2 | api | § 5 |
| TPL-207 | Given two windows with the same template open, when window 1 saves and window 2 then saves its older copy, then 200 with no conflict message and GET answers window 2's | P2 | ui | business file, § 5 |
| TPL-208 | Given two items with the same box, when saved, then 200 and both stay | P1 | unit | business file, § 3 |
| TPL-209 | Given 12.34 in a position or size, then the request holds and GET answers 12.3; the server applies the same rule to a body sent with 12.34 | P1 | unit+ui | § 5 |
| TPL-210 | Given a custom page 210.1 mm wide and an item at X 0.3, width 209.8 (as doubles the sum is 210.10000000000002), then it passes on the server and in `layout.ts`; X 0.4 is refused on both | P2 | unit | § 3 |
| TPL-211 | Given a name of only invisible format characters (zero-width space), then `nameRequired`; with U+200E, U+200F, U+061C or ZWNJ inside (pasted Arabic), then it passes; with U+202A-U+202E or U+2066-U+2069 inside, then `nameInvalid` | P1 | unit | § 5, `ValidationExtensions.cs:19-34` |
| TPL-212 | Given static text pasted with `\r\n` line breaks, or with a tab, then the line breaks are kept and the save doesn't answer `invalidText` for them | P2 | unit | D9, `ValidationExtensions.cs:36-39` |
| TPL-213 | Given a name of 60 characters with spaces around it, then it passes and GET answers it trimmed | P2 | unit | § 3 |
| TPL-214 | Given `items: []` or missing, then `templateTextCount`; an item with a missing or empty `id`, then `templateLayoutInvalid` | P2 | unit | § 5 |
| TPL-215 | Given the tab loading, then a progress indicator and no empty state; given its GET failing with 500, then «تعذّر تحميل البيانات.» with Retry and no «إنشاء قالب», so a saved template can't be replaced by a blank sheet | P0 | ui | § 6, ADM-097 |
| TPL-216 | Given A5, when each kind is added, then its box is inside the sheet and within the minimum sizes, its font size 11, and it passes `layout.ts`'s size, position and font rules with no edit | P1 | ui | business file, § 3 |
| TPL-217 | Given a custom 50 × 50 mm page, when each kind is added, then its box is inside the sheet (the prescription text's height at least 20 mm) | P2 | ui | § 3 |
| TPL-218 | Given two «التاريخ الكامل», or two manual inputs, added in a row, then the second starts with a distinct name («التاريخ الكامل 2») | P1 | ui | § 3 |
| TPL-219 | Given two items on the sheet, when the other one is clicked, then it becomes selected and the config shows its X, Y, width, height, font size and name or text; a changed name or static text shows on the sheet at once | P0 | ui | business file |
| TPL-220 | Given each kind selected, then the config holds: text: geometry + font; manual input and function: name + geometry + font; static: text + geometry + font, no name. Enter in the static text field adds a line and doesn't save | P1 | ui | § 3, D9 |
| TPL-221 | Given a custom width being typed through a valid value on its way (`50`, then `500`), when the typing ends at 500, then no item has been moved | P1 | ui | business file |
| TPL-222 | Given an item wider or taller than the new page (a 180 mm text box on A4, going to A5), when the size changes, then the item ends fully inside, its size reduced only as far as needed and never below the minimums, and the layout saves | P1 | unit+ui | business file |
| TPL-223 | Given A4 and an item at X 140, width 20, when A5 is chosen, then X is 128 and its width stays; items already inside don't move; going back to A4 doesn't restore the old X | P1 | unit | business file |
| TPL-224 | Given a number field emptied, or given a negative or off-sheet value, then the field shows its message, the item isn't silently corrected, and Save sends nothing | P1 | ui | TPL-048, § 3 |
| TPL-225 | Given the Arabic UI, when `12.5`, `12,5` and «١٢٫٥» are typed in a mm field, then each is 12.5, never 125 or 0 | P1 | e2e | § 3, `DosingFields.tsx:106` |
| TPL-226 | Given the Arabic UI, then the mm fields are left to right, and X still means from the left edge | P2 | ui | § 3 |
| TPL-227 | Given a custom 420 × 600 mm page at 1280 px, then the sheet scrolls inside its own area, the panels stay reachable, an item at the far corner can be selected, and the page has no horizontal scroll | P1 | e2e | § 3, test rules |
| TPL-228 | Given an item of 50 × 20 mm, then its box measures the same in the designer and in print layout, within 0.1 mm | P1 | e2e | § 6 |
| TPL-229 | Given unsaved edits, when the window narrows below 900 px and widens again, then the edits are still there and still count as unsaved | P2 | ui | D12 |
| TPL-230 | Given «إنشاء قالب» pressed and nothing saved, when leaving or reloading, then the unsaved warning shows; after confirming, the empty state returns and GET answers 204 | P1 | ui | § 6 |
| TPL-231 | Given a new sheet not saved yet, then no «حذف»; once saved, it shows | P2 | ui | business file |
| TPL-232 | Given unsaved changes, when the header's Back, another clinic tab, a sidebar entry or the logo is used, then «لديك تغييرات لم تُحفظ. هل تريد الخروج؟» asks; staying keeps the edits, leaving drops them. A reload or closing the page shows the browser's prompt | P1 | ui+e2e | D16 |
| TPL-247 | Given unsaved changes, when the browser's Back or Forward is used, then the same question asks; staying keeps the URL, the screen and the edits | P1 | e2e | D16 |
| TPL-248 | Given unsaved changes, when switching clinic or logging out from the user menu, or using «تعديل العيادة النموذجية» in the sidebar, then the question asks first; staying does none of them and keeps the edits | P1 | ui+e2e | D16 |
| TPL-249 | Given unsaved changes and the session or the context lost (a forced move), then no question blocks it: the move's own message shows | P1 | ui | D16 |
| TPL-250 | Given the data router, then deep links, reloads on a nested route, redirects and browser Back still work for a clinic user and the super admin | P0 | e2e | § 6 |
| TPL-233 | Given a value changed and typed back, when leaving, then no warning | P2 | ui | § 6, GRP-091 |
| TPL-234 | Given unsaved edits, when the UI language changes, then the edits stay and the sheet doesn't mirror | P2 | ui | § 3 |
| TPL-235 | Given the clinic deleted meanwhile, when Save answers 404, then a message and the page's "Clinic not found" state | P1 | ui | § 5, `api/dataScope.ts` |
| TPL-236 | Given a 400 from the server on a rule the screen passed (old SPA, new rule), then its message shows, the edits stay and Save works again | P2 | ui | § 5 |
| TPL-237 | Given 50 items, when another is added, then there is no 51st and a message or a disabled panel says why | P2 | ui | § 3 |
| TPL-238 | Given an invalid item that isn't selected, when Save is pressed, then that item gets selected and its field shows the message, since the config shows one item only | P1 | ui | TPL-048 |
| TPL-239 | Given a 60-character unbroken name and a 1,000-character static text in a small box, then the config wraps the static text; the name stays one line, scrolling inside its field; the sheet shows them past the box, unclipped, and the page has no horizontal scroll | P1 | e2e | § 4.5, § 6 |
| TPL-240 | Given the panel, when an item is double-clicked, then one item is added, as on the prescription page (`event.detail > 1`) | P1 | ui | double clicks, RX-012 |
| TPL-241 | Given «إنشاء قالب» double-clicked, then one new sheet; given the delete confirm double-clicked, then one DELETE and no error toast | P2 | ui | UX-028 |
| TPL-242 | Given a save in flight, when a field is edited before the answer, then the edit stays and the screen still counts as unsaved | P2 | ui | § 6 |
| TPL-243 | Given each case, then the exact texts in both languages: «لا يوجد قالب طباعة لهذه العيادة.», «حذف قالب الطباعة؟ سيختفي زر «طباعة» من العيادة، ولا يمكن التراجع عن ذلك.», «الاسم مطلوب.», «هذا الاسم مستخدم في عنصر آخر.», «الاسم طويل جدًا.», «اكتب النص.», «العنصر خارج حدود الورقة.» (English texts in the contract) | P1 | ui | «الرسائل» |
| TPL-244 | Given every new `template*` code, then `errors.<code>` is in `en.ts` and `ar.ts` | P1 | unit | § 5, ERR-030 |
| TPL-245 | Given clinic A's designer with unsaved edits, when going to clinic B's tab by history, then none of A's sheet, selection or edits shows under B | P1 | ui | ADM-100, `ClinicPage.tsx:87` |
| TPL-246 | Given 375 px in both languages, then the four clinic tabs are reachable, the message wraps, and the page has no horizontal scroll | P1 | e2e | D12, ADM-283 |
| TPL-251 | Given a saved custom template, when a new sheet width is typed and the focus stays in the field (not committed yet; the height the same), then the screen counts as unsaved: Save is enabled, `beforeunload` is prevented and leaving through a tab or link asks the question; pressing Save commits the size and saves in one press: one PUT holding the new width, «تم حفظ القالب» and no «تم حذف». Typed back to the committed number, it counts as clean again, no question. The sheet still doesn't resize per keystroke and no item moves until the commit (TPL-221) | P1 | ui+e2e | D16 |
| TPL-252 | Given a huge value such as `1e26`, then `formatMm` writes it in plain digits, never an exponent | P2 | unit | § 3 |
| TPL-253 | Given an item added whose box lies outside the sheet area's view, then its box is scrolled into view (`block` and `inline` `nearest`) and the focus stays on the panel entry | P2 | ui | D8 |

## Step 2: printing

### Clinic read route and the button

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-100 | Given a template, when a user with `prescriptions.create` GETs `/prescription-template`, then 200 with it; with no template, 204 | P0 | api | § 5 |
| TPL-101 | Given a user without `prescriptions.create`, or a platform token, then 403 `forbidden` | P0 | api | § 5, access |
| TPL-102 | Given clinic B's user, when reading, then B's template only; the route takes no clinic id | P0 | api | clinic scoping |
| TPL-103 | Given a clinic with no template, then no Print button in the panel or the editor, and Copy and «تعديل ونسخ» work as before | P0 | ui+e2e | D6 |
| TPL-104 | Given a template and no lines, then Print beside Copy shows disabled, without a tooltip, like Copy | P1 | ui | § 4 |
| TPL-105 | Given the read that fails when the page opens, then no Print button shows until the page is opened again, and the page works | P1 | ui | § 4 |

### Pop-up

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-110 | Given manual inputs «الاسم» and «السن», when Print is pressed, then the pop-up shows both in template order, labelled by their names, empty, focus on the first | P0 | ui | § 4 |
| TPL-111 | Given a template with no manual input, when Print is pressed, then no pop-up and the print starts | P1 | ui | § 4 |
| TPL-112 | Given the pop-up, when fields are left empty and Print is confirmed, then it prints, with those spaces blank | P0 | ui+e2e | D10 |
| TPL-113 | Given the pop-up, when Cancel or Esc, then nothing prints; opening again shows it empty | P1 | ui | § 4 |
| TPL-114 | Given a value of 200 characters passes; 201 can't be typed. A pasted line break becomes a space | P2 | ui | § 3 |
| TPL-115 | Given values typed and printed, when Print is pressed again, then the fields are empty, and nothing was written to storage | P1 | ui | § 4 |
| TPL-116 | Given the pop-up, when confirm is pressed twice quickly, then `window.print` is called once | P1 | ui | double clicks |
| TPL-117 | Given the pop-up on a phone, then it fits at 375 px, its fields are reachable and text isn't cut | P1 | e2e | D12 |

### The printed sheet

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-120 | Given A5, A4 and a custom template, when printed (`page.pdf` with `preferCSSPageSize`), then the PDF page is that size within 1 pt (A5: about 420 × 595 pt) with no margin | P0 | e2e | D13, § 4 |
| TPL-121 | Given an item at X, Y, width, height, when the sheet is laid out for print, then its box is at those mm within 0.1 mm, in Arabic and in English UI | P0 | e2e | § 3 |
| TPL-122 | Given print media, then only the sheet shows: no app bar, sidebar, buttons, dialog, backdrop or toast; after printing, the app is back and the print root is gone | P0 | e2e | § 4 |
| TPL-123 | Given two drugs, when Print beside Copy, then the text equals the Copy text: names bold, dosing sentences, notes, in the prescription's order | P0 | unit+e2e | D7 |
| TPL-124 | Given the editor with a changed word, bold and a list, when Print in the editor, then the edited text prints with them; the lines themselves are unchanged | P0 | e2e | D7 |
| TPL-125 | Given edits in the editor, when closed without printing and Print beside Copy is pressed, then the generated text prints: edits aren't kept | P1 | ui | D7 |
| TPL-126 | Given a mixed line «أموكسيسيلين Amoxicillin 500mg مرتين يوميًا (2×) لمدة 7 أيام», then letters are joined and the order is right in the print layout | P0 | e2e | research |
| TPL-127 | Given each function, then its value is as in § 3 for a frozen clock (midnight, noon, one-digit day, Friday), in Arabic with Latin digits, whatever the UI language | P1 | unit | D11 |
| TPL-128 | Given static text with line breaks, then each prints on its own line | P1 | e2e | D9 |
| TPL-129 | Given a font size per item, then each prints at its own size | P1 | e2e | D15 |
| TPL-130 | Given the sheet's font under its own family name, then it's loaded from the app, in regular and bold, before `window.print`, with Google Fonts blocked | P1 | e2e | D15, § 6 |
| TPL-131 | Given a value longer than its box, then it wraps and shows past the box, cut only at the sheet's edge | P1 | e2e | § 4 |
| TPL-132 | Given a function's name or a manual input's name, then neither prints: only values | P1 | ui | § 3 |
| TPL-133 | Given HTML in a drug name, a note or the editor (a script, an image with `onerror`), then it prints as text or is removed and nothing runs | P0 | unit+e2e | § 4 |

### Continuation pages

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-140 | Given text that fits exactly, then one page; one line more, then two | P0 | e2e | D14 |
| TPL-141 | Given a prescription of 40 drugs, then every drug's text appears exactly once across the pages and none is cut | P0 | e2e | § 4 |
| TPL-142 | Given a continuation page, then every other item repeats in the same place with the same value | P0 | e2e | D14 |
| TPL-143 | Given a drug that doesn't fit the rest of the box but fits a box, then it moves whole to the next page | P1 | e2e | § 4 |
| TPL-144 | Given a paragraph taller than the box (a long note), then it splits between words and nothing is lost | P1 | e2e | § 4 |
| TPL-147 | Given the editor's HTML (Quill makes each line its own paragraph), then a drug's lines between blank paragraphs still move as one when they fit a box | P1 | e2e | § 4 |
| TPL-145 | Given a one-page prescription, then the page number prints nothing; with three pages it prints 1/3, 2/3, 3/3 | P1 | e2e | D14 |

### Staying current

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-150 | Given a template changed after the page loaded, when Print is pressed, then the new one is used | P1 | ui | § 4 |
| TPL-151 | Given a template removed after the page loaded, when Print is pressed, then «لم يعد لهذه العيادة قالب طباعة.», nothing prints and the button disappears | P1 | ui | § 4 |
| TPL-152 | Given the network failing when Print is pressed, then the error message shows and nothing prints | P1 | ui | § 4 |
| TPL-153 | Given a clinic switched, then the Print button follows the new clinic's template, never the old one | P0 | e2e | clinic scoping |

### Checked by hand

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-190 | Given a real printer and a pre-printed A5 sheet at 100%, then every item is within 1 mm of its place, measured with a ruler | P0 | manual | § 8 |
| TPL-191 | Given a real phone and a printer, then the prescription prints with text intact; record the offset | P1 | manual | D12 |

### Edge cases

| ID | Case | P | Level | Source |
|---|---|---|---|---|
| TPL-300 | Given `GET /prescription-template`, then a no-context token 403 `forbidden`; deactivated or removed staff 403 `noAccess`; a suspended clinic 403 `clinicSuspended`; a deleted clinic 403 `noAccess`; a role with only `drugs.list` 403 `forbidden` | P1 | api | ACC-035 to ACC-039, access |
| TPL-301 | Given the super admin in the template clinic's context, when GET is called, then 204: the template clinic can never hold one | P2 | api | § 5, D6 |
| TPL-302 | Given the page opened once, then a template saved, when the user goes to `/drugs` and back within 30 s, or reloads, then Print shows | P1 | ui | business file, `AppProviders.tsx:40` |
| TPL-303 | Given the page left open and a template saved meanwhile, then no Print until the page is opened again, and nothing breaks | P2 | ui | business file |
| TPL-304 | Given the editor with everything deleted, or only spaces, or one empty list item, then Print in the editor is disabled; typing a letter enables it; the editor's Copy behaves as today | P1 | ui | § 4.1, `prescriptionText.ts:67`, `EditorContent.tsx:78` |
| TPL-305 | Given a template, at 375, 600, 900 and 1280 px in both languages, then the panel's three buttons and the editor's Close, Print and Copy fit, with no cut or overlap | P1 | e2e | D12, UX-004 |
| TPL-306 | Given a Print flow, then «اطبع بمقياس 100% دون «ملاءمة للصفحة».» shows: in the pop-up, and beside Print when there's no pop-up | P1 | ui | business file, § 4.6 |
| TPL-307 | Given Print double-clicked, then one template request and one `window.print`, or one pop-up that stays open; a click while the read is pending does nothing | P1 | ui | double clicks |
| TPL-308 | Given the pop-up with typed values, when clicking outside, then it stays, with the values, like the protocol dialogs | P1 | ui | RX-022 |
| TPL-309 | Given the pop-up opened from the editor, when Esc or Cancel, then only the pop-up closes; the editor stays with its edits and the focus returns to its Print | P1 | ui | § 4.3, D7 |
| TPL-310 | Given a pop-up field, when Enter is pressed, then the print is confirmed, same as the button | P2 | ui | UX-022 |
| TPL-311 | Given a template of 49 manual inputs, then all show in order, inside a scrolling content, with the buttons outside it | P2 | ui | § 3, `DialogForm` |
| TPL-312 | Given a pop-up field, when Arabic is typed in the English UI, or the reverse, then the text keeps its own direction, and so does the label | P2 | ui | I18N-018 |
| TPL-313 | Given a manual value or static text such as `<img src=x onerror=…>` or `<b>x</b>`, then it prints literally as text, no element is created and nothing runs | P0 | ui | § 8 |
| TPL-314 | Given a value of only spaces, or with spaces around it, then it prints blank, or trimmed | P2 | ui | D10 |
| TPL-315 | Given the template changed after the pop-up opened, when confirmed, then the copy read at the click prints, and confirming sends no request | P2 | ui | § 4.2 |
| TPL-316 | Given a frozen clock, the pop-up opened at 23:59 and confirmed at 00:01, then the date is the new day and the time `12:01 ص`; with no pop-up, the time of the click; every page has that value | P1 | ui | business file, § 3 |
| TPL-317 | Given the browser's locale `en-US`, `fr-FR` or `ar-SA`, then the values are still Gregorian with Latin digits (`5 نوفمبر 2026`), and each string equals § 3's character for character, with no U+200F or U+202F from `Intl` | P1 | unit | D11, § 3 |
| TPL-318 | Given print layout, then `2026-11-05T14:30` and `2/3` read left to right inside the sheet, whatever the UI language | P1 | e2e | § 3 |
| TPL-319 | Given the browser's dialog cancelled (`afterprint` with nothing printed), then the app is back, the lines and any editor edits unchanged, no toast, no write request; Print works again and the pop-up starts empty | P1 | ui | § 4.3, D7 |
| TPL-320 | Given `afterprint` never fired, when Print is used again, then one print element and one `@page` rule, the new values and text, `window.print` called again | P1 | ui | § 4.4 |
| TPL-321 | Given the print element present (`afterprint` not fired), then at 1280 and 375 px nothing of it shows on screen, no horizontal scroll, nothing inside it takes the focus, and axe passes | P1 | e2e | § 4.4 |
| TPL-322 | Given `window.print` returning at once (some phone browsers), then the print element stays until `afterprint` or the next print, so the page isn't emptied before it prints | P1 | ui | D12, § 4.4 |
| TPL-323 | Given a printed prescription and `afterprint` fired, or a clinic with no template, when the browser's own Ctrl+P is used (print media), then the app shows as it does today, not a blank page, not the last patient's sheet, and no leftover `@page` size | P1 | e2e | D6 |
| TPL-324 | Given Print in the editor, when the print ends, then the editor stays open with its edits, and printing again uses them | P1 | ui | D7 |
| TPL-325 | Given Print in the editor through the pop-up, with a three-page text, then the PDF has three pages holding only the sheet: no dialog, backdrop, toast or tooltip | P0 | e2e | § 4.4, D14 |
| TPL-326 | Given edited text ending in many empty lines, then they make no sheet of their own and the page number doesn't count one; a continuation page doesn't start with a blank line | P1 | e2e | § 4.5 |
| TPL-327 | Given a numbered list of 30 items crossing pages, then the numbers continue, each item appears once; the same count of pages whether or not the editor (and its CSS) was opened before | P1 | e2e | § 4, D14 |
| TPL-328 | Given editor HTML using every toolbar format (bold, italic, underline, both lists, direction, all alignments, indent) and `<strong dir="ltr">`, then cleaning keeps each, and the result equals `htmlForPaste` on those parts | P1 | unit | § 4, `prescriptionText.ts:45,86-100` |
| TPL-329 | Given pasted content with an image, a link, a color, a font family or size, or `position: fixed`, then the text stays, the image is gone and never requested, the font and size are the template's | P1 | unit | D15, § 4, `QuillEditor.tsx:53` |
| TPL-330 | Given a line with «لا توجد جرعة محددة» or «معطّل من الإدارة» on screen, then neither prints | P1 | unit | prescription business, RX-107 |
| TPL-331 | Given the font file failing to load (route aborted), then the print still runs once with the fallback font, no text lost, and the app stays usable | P1 | e2e | § 6 |
| TPL-332 | Given the font file delayed by 2 s, then `window.print` isn't called before it has loaded | P1 | e2e | § 4.4 |
| TPL-333 | Given custom 420 × 600 mm and a landscape 210 × 148 mm, then the PDF page is that size and orientation, with items in place | P1 | e2e | D13 |
| TPL-334 | Given a custom page larger than the paper in a real printer, then record what the browser does (scale, cut); nothing is promised | P2 | manual | § 8 |
| TPL-335 | Given a 20 mm box at 36 pt and 40 drugs, then the print ends within the test's time, the page number shows three-digit values if reached, each page has all items, each drug appears once. Replaces TPL-146, which as P2 e2e would never run | P1 | e2e | D14, README |
| TPL-336 | Given a 20 mm box at 36 pt, then each line shows whole, none clipped by the box's edge | P1 | e2e | § 3 |
| TPL-337 | Given the same long text, then the Arabic and the English UI give the same page count and the same text on each page (column flow must not follow the UI's direction) | P1 | e2e | § 3, § 4 |
| TPL-338 | Given the English UI, then the printed text and values are Arabic, right to left, on a sheet that doesn't mirror | P1 | e2e | D7, D11, RX-072 |
| TPL-339 | Given an item at the sheet's bottom with a value too long for its box, then no extra page appears and the PDF's page count is unchanged | P1 | e2e | § 4.5 |
| TPL-340 | Given a 256-character unbroken drug name, then it wraps inside the prescription box, appears once, and doesn't spill into the next page's column | P1 | e2e | § 8, UX-009 |
| TPL-341 | Given a read in flight or the pop-up open, when another tab's switch or logout reaches this tab (the page re-mounts or goes to login), then nothing prints, the pop-up is gone and the other clinic never shows it | P1 | ui | § 4.2, AUTH-197, `client.ts:73` |
| TPL-342 | Given an expired access token at Print, then the refresh and replay run and the flow continues once; given the refresh failing, then login, nothing prints, and the lines are still there after logging in | P1 | ui | § 4.2, `client.ts:64-77` |
| TPL-343 | Given 403 at Print (`forbidden`, or `clinicSuspended` after the replay), then one message only (the query cache already toasts a 403), nothing prints, `/me` reloads | P1 | ui | `AppProviders.tsx:25-34` |
| TPL-344 | Given a failed read at Print, when the network returns and Print is pressed, then it works, and the button never stayed stuck | P2 | ui | § 4.2 |
| TPL-345 | Given the editor open and the template removed, when Print there, then the message, Print gone from the editor and the panel, the editor stays with its edits and Copy works | P1 | ui | § 4.2, D7 |
| TPL-346 | Given 375 px and no manual input, when Print, then `window.print` runs and the PDF page is the template's size with items at their mm | P1 | e2e | D12 |
| TPL-347 | Given real Chrome on Windows, then the dialog's preview shows the template's size, no browser header or footer at margin none; Cancel returns to the app | P1 | manual | § 8 |
| TPL-348 | Given the pop-up and the page with Print in Arabic, in English and on a phone, then axe and the cut-text check pass | P1 | e2e | test rules |

## Existing cases changed

| ID | Why |
|---|---|
| ADM-098 | Lists the tabs as Overview, Roles, Staff with their URLs: gains «قالب الطباعة», `/print-template`. No test is tagged with it today |
| ADM-282 | "clinic tabs" now includes the new tab: `e2e/admin/layout.spec.ts:113` doesn't open it |
| ADM-283 | Same at 375 px, with the desktop-only message: `e2e/admin/layout.spec.ts:150` |
| RX-075 | Quotes «التعديلات هنا للنسخ فقط ولا يتم حفظها.» and the title «تعديل قبل النسخ»: wrong once the editor prints (new text: «للنسخ أو الطباعة»). Tests: `e2e/prescription/copy.spec.ts:100-108`, `e2e/support/texts-rx.ts:142-143,201-202`, `e2e/support/texts-ux.ts:22` |
| UX-004 | «نسخ» / «تعديل ونسخ» stacked at 375 px: Print joins them when a template exists. `e2e/ux/phone.spec.ts:117` uses a clinic with none, so it still passes; TPL-305 covers the rest |
| UX-014 | Tooltips of the two buttons: Print joins them with the 100% hint. `SelectionPanel.test.tsx:37,45` |
| UX-036 | "every page" adds the designer and the pop-up (no text change; TPL-056, TPL-348) |
| ERR-030 | The code list in `locales.test.ts:79-87` must add the 10 `template*` codes (TPL-244) |
| I18N-006 | Its page and dialog list adds the designer and the pop-up |
| I18N-013 | `docMessages.test.ts:291` checks a `DOCS` list and fails on an unmapped row: the new `business.md` joins it, and any row added to the prescription table must be mapped |

- **No change:** RX-004 and RX-071 to RX-078 stay true for a clinic with no template (RX-075 aside). ACC-001 (no new permission). ACC-034 to ACC-039 name catalog routes only, so TPL-101 and TPL-300 carry the new route. No case in AUTH, ISO, DRUG, GRP, DOSE, TAPER or CAT changes. A search of the catalog for print words in English and Arabic finds nothing, so no case retires.
- **Tests that break without a case changing:** an unanswered request fails a Vitest test (`src/test/setup.ts:36-43`), so the page's new GET needs a default 204 in `src/test/pages/prescription.tsx:38` and in the `startApp` tests that open `/` (`App.session.test.tsx`, `App.access.test.tsx`). `SelectionPanel.test.tsx:21-34` passes a fixed prop list.
- **Also touched:** the catalog's summary table and new area, the area list in `tests/tools/traceability/traceability.ps1:35`, `PURE_LOGIC` in `vite.config.ts` and `stryker.config.json` for `layout.ts` and `functions.ts`.
