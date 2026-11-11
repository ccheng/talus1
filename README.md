## Milestone 2C.2 final integrity gate — independent retest correction (November 2026)

The independent corrective Work-mode retest found that five of six 2C.2 findings had passed. The remaining release-blocking defect was the ability to generate an invalid student assessment after clicking **I verified these document-level source warnings** on a malformed Word fraction import. The question still contained `[Word equation requires manual review: ...]`.

This release adds **non-dismissible, content-level equation validation** independently of `master.importWarnings`:

- Detect unresolved Word-equation placeholders in stems, reference answers, answer choices, general/section instructions and grouped question content.
- Inspect embedded MathML for missing or empty fraction operands, script operands and root arguments, including when a JSON backup has no source warnings.
- Ensure clicking a document-level warning acknowledgement never overrides content integrity validation. Generation remains disabled through refresh and JSON restoration until the offending content is actually corrected.
- Preserve the intact second (9/4) fraction while blocking the malformed (17 over a missing denominator) question.

**Test-first evidence:** The seven new unit checks failed against the prior release, while 34 older unit checks passed. The corrective changes passed the full unit/browser suite including Playwright reproduction of warning acknowledgement and backup restore. The original `F-malformed.docx` is retained in the independent Work-mode evidence ZIP; the permanent Playwright regression uses a compact OOXML reproduction.

A source-warning acknowledgement is not a substitute for repairing a question. Previously exported corrupt assessments and previously corrupted JSON backups do not repair themselves; users should re-import the original Word document or directly fix the content.

## Milestone 2C.2 corrective acceptance release (November 2026)

**Test-first evidence:** Six new browser tests reproduced the six independent Work-mode 2C.2 findings and all failed on the original 2C.2 release (red phase). They passed after the corresponding fixes (green phase); the full existing regression suite remains required before GitHub Pages deployment. The automated tests use compact OOXML reproductions of the exact Word constructs identified in the supplied acceptance evidence. Independent final acceptance with the complete original Word documents is still recommended.

- **2C2-01 (P0):** Preserve explicit OMML delimiter pairs, including absolute-value bars `|...|` and square brackets, rather than replacing all delimiters with parentheses. Grouping and meaning must remain intact.
- **2C2-02 / 2C2-04 (P0/P1):** Reference-answer parsing now removes only the `Answer:` label while retaining the underlying rich Word HTML. Superscripted scientific exponents and inline MathML with adjacent units survive the review field, answer keys, exports, and backups.
- **2C2-03 (P0):** Reject incomplete OMML fractions (missing or empty numerator/denominator) and script operands. The importer leaves an actionable placeholder, persists a blocking conversion warning in JSON, and disables generation after reload/restore. Intact neighboring equations continue to import normally.
- **2C2-05 (P2):** Avoid scrollbars on compact MathML by keeping equation overflow visible; handle genuinely wide content at its parent container.
- **2C2-06 (P2):** Preserve block/display MathML from Word's `oMathPara` and classify Unicode mathematical minus as an operator (`mo`), rather than an identifier (`mi`).
- **Additional protection:** Re-detection from intentionally edited plain-text source now explicitly includes Word equations in its media-loss confirmation and blocking warning.

**Coverage:** `e2e/acceptance22-corrective.spec.ts` includes individual Word-style reproductions for each defect, a six-version student/key ZIP integrity test, and persistence of malformed-math blocking warnings across JSON restore. All existing 2C.1 and 2C.2 browser tests still run before release.

**Remaining limitations:** This converter still supports a deliberately constrained OMML subset. Unsupported complex objects require manual correction before generation. External Markdown viewers may render MathML differently, and Word-desktop fidelity remains subject to independent acceptance.

## Milestone 2C.2 — Scientific notation and Word equations (2026-11)

This milestone adds deterministic preservation of common Word Office Math (OMML) expressions while keeping the whole application client-side:

- **Scientific formatting:** Word superscripts, subscripts, chemical formulas, SI units, powers of ten, Greek letters and Unicode mathematics remain rich HTML through import, authoring, version generation and backup.
- **Word equations:** The importer converts supported OMML structures to browser-native **MathML**, including fractions, ordinary and combined sub/superscripts, square and indexed roots, simple functions, delimiters, summation-style operators, limits, and equation arrays. Inline and standalone display equations are supported.
- **Fail-closed handling:** Unsupported or empty equation structures are replaced by visible `[Word equation requires manual review]` placeholders, with actionable source warnings that persist in Talus JSON and prevent generation until explicitly corrected.
- **Editor integrity:** MathML-bearing questions use the raw HTML editor with a live preview, preventing the existing text-only Tiptap extension set from silently stripping equations. Dedicated visual equation editing belongs to 2C.3.
- **Exports:** MathML survives student/key browser previews, Markdown and six-version ZIP exports as raw embedded MathML, and JSON backup/restore. External Markdown readers vary in their support for MathML; the Talus print preview is the visual reference.

**Important limitations:** This is a supported deterministic OMML subset, **not full Microsoft Word equation fidelity**. Complex matrices, stacked accents, boxes, advanced stretchy delimiters, specialized formatting, handwritten equations, and arbitrary embedded OLE equation objects may require manual correction. Unsupported structures should never disappear without a warning. Existing plain chemical formulas and mathematical Unicode remain supported.

**Acceptance:** Browser tests upload actual OOXML Word files containing inline and block OMML, fractions, powers, combined subscripts and superscripts, radical expressions, chemical formula markup, Greek symbols and an unsupported equation construct. The tests verify review fidelity, author text edits, six versions, backup/restore, student Markdown and ZIP content, and generation blocking for unsupported elements. Independent Work-mode classroom-document acceptance remains the final release gate.

## Milestone 2C.1 corrective release — independent acceptance fixes (2026-11-10)

This release uses a documented **red → green** regression workflow against the Work-mode 2C.1 acceptance findings. The five new Chromium tests first failed on the existing app, then passed after the corrections; unit regressions check persistence and proficiency formatting.

- **2C1-01 (P0):** Pressing Detect again on an unchanged Word/HTML import now keeps the same rich reviewed draft, source title, embedded images, tables, and prior review edits. If a teacher edits the text-only source of a rich import, re-detection explicitly warns that it will drop the rich media and requires confirmation. That intentional downgrade retains a blocking media-loss warning in the accepted JSON.
- **2C1-02 (P1):** Mammoth conversion warnings about missing external images, links, and other graphical media are carried through acceptance into persistent `importWarnings`. Version generation remains disabled after refresh and JSON restore until a teacher repairs/explicitly resolves the problem.
- **2C1-03 (P1):** Raster files must actually decode (using the browser image decoder) in addition to passing the format, base64, and size checks. Corrupt PNGs become visible placeholders and produce blocking, persisted warnings. Earlier demonstration fixtures had an invalid PNG CRC; their regression media were corrected rather than weakening this validation.
- **2C1-04 (P2):** Original Word `wp:extent` image sizes are converted from English Metric Units to CSS pixels (96 px/inch) when the embedded images can be mapped unambiguously. Responsive CSS still scales down to the available column width.
- **2C1-05 (P3):** A proficiency suffix already present in the section heading is not duplicated in the browser preview or exported Markdown.

**Verification:** `e2e/acceptance21-followup.spec.ts` contains reproductions of the original A/D/K/L Word OOXML structures, including linked and corrupt media, five drawings, tables and original display geometry; `src/acceptance21-followup.test.ts` covers persistence and headings. The original Word binaries are retained separately in the independent Work-mode evidence ZIP. The tests intentionally use compact reproducible documents rather than claiming to contain byte-for-byte copies of all original fixtures.

**Residual limitations:** Linked Word images cannot be fetched; embed them in the DOCX instead. Image dimensions are mapped only where image/drawing ordering is unambiguous. An independent post-deployment Work-mode retest using the exact original fixtures remains recommended before closing acceptance.

## Milestone 2C.1 — Embedded images and structured tables (November 2026)

Talus now preserves common Word illustrations and tables in the existing client-side assessment workflow:

- **Import:** Word `.docx` images are converted to self-contained raster data URIs, including pictures in otherwise textless paragraphs. Word tables retain their rows, cells and supported HTML structure. HTML uploads with embedded images and tables also work.
- **Side-by-side review:** Word/HTML source illustrations and tables are visible on the left, with the proposed question content on the right. The review preview preserves image sources, alt text and table contents.
- **Editing safety:** Authoring text containing images or tables uses a preview plus an HTML source editor instead of Tiptap, because the current rich-text extension set would otherwise strip those unsupported structures. Full visual editing of diagrams and tables is reserved for Milestone 2C.3.
- **Generation and portability:** Versioned print previews, JSON backups, browser refresh/restore, Markdown exports, and the complete ZIP batch retain supported embedded images and tables. Markdown tables are retained as raw HTML; illustrations use data-URI references so they do not require a server or temporary browser URL.
- **Fail closed:** Unsupported/remote image formats, images larger than **1 MiB each**, and more than **2 MiB of unique embedded image data** are flagged instead of silently dropped. The complete JSON backup is capped at **3.5 MB**, to leave headroom for synchronous browser recovery storage. Unresolved media-loss warnings persist and block generation until the source is corrected and explicitly reviewed. Malformed table content also produces a warning.
- **Formats:** PNG, JPEG, GIF, and WebP raster images. Vector-only Word drawings, embedded Office shapes/charts, complex equation objects, and full table editing fidelity are not yet supported.

**Compatibility:** Some Markdown readers block or fail to display `data:` image URLs and raw HTML tables. Talus's browser print preview remains the most reliable visual check; editable Word export is planned for Milestone 3. Always compare student forms with the original Word document before classroom distribution.

**Regression coverage:** A generated realistic Word OOXML fixture containing a PNG and a three-row table is imported, reviewed, generated into six versions, backed up/restored, and checked in the single Markdown and ZIP exports. HTML image/table import, source-preview fidelity, rejected remote/oversized images, and JSON asset-validation checks are also covered. GitHub Actions runs these tests before deploying.

## Milestone 2.1 — Import correctness and review reliability (November 2026)

The 2A/2B independent Work-mode acceptance report identified three release blockers and additional review issues. Corrective release 2.1 addresses them:

- **P0 malformed multiple choice:** preserve empty or out-of-order answer choices and reject keys that do not match them. No silent downgrade to a valid short-answer question. Missing/invalid choices and unresolved source mappings disable version generation, including after importing a JSON backup.
- **P1 compact Markdown:** parse original source lines rather than relying on Markdown paragraph spacing, preserving numbered questions, lettered answers, bold/italic and scientific HTML scripts. Lists are represented as real list elements.
- **P1 detached Word answer keys:** recognize a separate *Answer Key* heading and map numbered entries back to their uniquely numbered source questions. Unmapped or ambiguous key entries are flagged and block generation until explicitly reviewed; key entries never become student questions.
- **P2 review reliability:** warn on merging separately keyed questions; retain staged review while moving between Import and Author; strip Word question numbering even inside emphasis; expose section-removal relocation and discarded instructions in a confirmation; provide Move up/Move down buttons for explicit question ordering.
- **P2 document metadata and formatting:** recognize a Word title plus preamble, or a Markdown H1 title and preamble, without creating an artificial instructions-only section. Preserve Markdown lists.
- **P3 accessibility:** per-choice removal buttons have distinct accessible names. Browser regression tests include tablet viewports.
- **Fail-closed validation:** unresolved *question-level* and important *document-level* source warnings persist in Talus JSON backups. The authoring interface displays them and requires an explicit acknowledgment after correction; they prevent version generation until resolved. Existing version 1 backups remain importable.

Regression tests cover representative content and reproduction sequences from the Work-mode report, including its exact malformed-MC input and compact chemistry Markdown, synthetic DOCX documents based on the reported Word contents, document/key boundaries, output answer keys and student Markdown, and review controls. The standard Vitest and Chromium Playwright checks run automatically on every push and block deployment on failure.

**Important:** Deterministic parsing is still not a general guarantee that every unusual document can be interpreted perfectly. Compare parsed questions and keys with the original before accepting and distributing forms. Complex images, diagrams, tables and equation fidelity remain planned for Milestone 2C. The Work-mode acceptance report's own DOCX binary fixtures should also be retested independently in a real browser.

# Talus Test Versioner

**Live application:** https://ccheng.github.io/talus1/

Talus is a client-side assessment authoring and test versioning application. No hosted account or backend is required.

## Milestone 2A + 2B — importing and reviewing existing assessments

Use **Import assessment** in the header to open a two-pane workflow.

- **Input:** Paste plain text or Markdown copied from Word/Google Docs; upload `.docx`, `.md`, `.txt`, or `.html` documents. Word files are converted entirely in the browser using Mammoth, and Markdown is rendered locally using Marked.
- **Deterministic detection:** Identify numbered questions (e.g. `1.`), section/part headings, lettered options (`A.`), explicit answer lines (`Answer: B` or `Answer: A, C`), and point values (`(2 marks)`). Section order is preserved. Unrecognized text stays in the source/review area rather than being silently discarded.
- **Review:** Keep the source on the left and the parsed assessment on the right. Edit the test title, section names and proficiency tags, prompts, choices, correct-answer selections, reference answers, marks, response lines, and question types. Split or merge questions, move them to other sections, and add/remove questions or sections.
- **Safe acceptance:** Nothing changes in the active master until **Accept reviewed import**. Choose to replace the open assessment or append the reviewed sections. Replacement requires confirmation. Missing answers are flagged; accepting unresolved warnings requires confirmation and the resulting assessment remains invalid for version generation until corrected.
- **After import:** Use the existing authoring, shuffle/version generation, answer key, ZIP batch export, autosave, and JSON backup features normally.

**Format limits (Milestone 2A/B):** Deterministic parsing handles common numbered formats, not every Word numbering or layout convention. The preview preserves supported inline formatting, but splitting a question and some imported structures may require manual correction. Embedded diagrams/images, complex tables/equations, and high-fidelity document formatting are Milestone 2C work. Browser-local AI parsing is deferred to Milestone 2D. Text pasted into the plain-text field does not preserve clipboard rich text; upload the Word document instead for supported inline formatting. Verify imported assessment content and answers before distributing versions.

The browser CI suite now includes actual paste/Markdown/DOCX import tests, warning resolution, split/merge review, and an end-to-end import-to-version-generation/persistence test. Parser unit tests verify section boundaries, answer keys, section appending and missing-key warnings.

## Milestone 1.1 — corrective release (November 8, 2026)

- T1: One ZIP file contains all student forms, answer keys, and a generation manifest, avoiding browser multi-download limits.
- T2: Each edit is synchronously saved in local browser storage; IndexedDB remains an additional copy. If both fail, the UI warns and attempts to prevent closing with unsaved work.
- T3: Saved generation count, seed, immutable run ID, and per-version slot/variant/choice manifests. The UI restores generated versions from validated saved metadata after refresh.
- T4: Editing invalidates versions and replaces stale success banners with an explicit regeneration message.
- T5: Customizable response lines (defaults: 2 for short answers, 8 for written responses), shown in both preview and Markdown.
- T6: Correct singular/plural mark labels in both preview and Markdown.

Old schemaVersion 1 backups remain importable; the new optional fields are backward compatible. A generated run ID is tied to its source assessment revision. This is a browser-local app; users should export JSON backups routinely. For storage failures, navigation warning support varies by browser.

## Milestone 1 functionality

- Create assessments with independently shuffled sections; section order remains fixed.
- Rich-text editing of prompts, instructions, answers and answer choices (bold, italic, lists, code blocks, superscript, subscript).
- Single-answer multiple choice, multiple-select, short answer, and written-response questions.
- Each question slot appears exactly once per version. Create complete alternative question variants; deterministic rotation distributes alternatives across versions.
- Deterministically shuffle question positions and answer choices using a seed. Individual question positions can be fixed.
- Validate question prompts, selected correct answers, answer references, and equivalent marks before generating.
- Automatically number questions continuously across sections and produce answer keys with the correct letters after shuffling.
- Preview student versions and answer keys, print them, or export Markdown files.
- Autosave to IndexedDB on the device, import/export portable `.talus.json` master backups.

**Important:** Work is stored locally in the browser. Export a JSON backup frequently. Clearing site data or changing devices can remove local tests.

**Current limitations:** Only JSON test importing is supported. Word/DOCX import/export, pasted-test parsing, advanced tables/images/equations and offline AI import assistance are future work. Markdown conversions may lose advanced rich-text formatting. Grouped question blocks are modeled and supported by the generator but do not yet have an authoring control.

## Cloud build and deployment

GitHub Actions handles `npm install`, `npm test`, `npm run build`, and GitHub Pages publication of `dist/` on push to `main`. Vite base is `/talus1/`.

Optional development commands: `npm install`, `npm test`, `npm run build`, `npm run dev`.

## Automated browser regression testing

Playwright Chromium tests are stored in `e2e/regressions.spec.ts` with deterministic sample assessments in `e2e/fixtures.ts`. Configuration is in `playwright.config.ts`.

The required GitHub Actions pipeline runs the following checks **before deployment**:

1. `npm test` — Vitest unit and logic regression tests.
2. `npm run build` — TypeScript production build.
3. `npx playwright install --with-deps chromium` — browser installation on GitHub's cloud runner.
4. `npm run test:e2e` — Playwright tests using the compiled Vite preview site at `/talus1/`.
5. Publish to GitHub Pages only after all checks pass.

The nine Chromium scenarios cover: immediate-refresh autosave (T2), restored generated versions/count/seed (T3), older JSON import precedence both with and without saved runs, complete single-ZIP batch downloads (T1), correctness of questions/sections/alternatives/answer keys, stale success banners (T4), response space and mark labels (T5/T6), and rich-text preview rendering. Every test uses a fresh isolated browser context and local data. GitHub uploads an HTML report, screenshots, trace files, and videos as `playwright-evidence` even if the tests fail (14-day retention).

To run the browser tests independently where Playwright is installed, execute `npm run build`, `npx playwright install chromium`, then `npm run test:e2e`. This is optional: GitHub Actions performs these steps automatically on every push and pull request.

**Limitations:** The CI browser suite currently targets desktop Chromium. It does not yet test Safari/WebKit, Firefox, mobile responsive layouts, or native OS printing. In-browser workflows are exercised rather than the publicly deployed URL, so deployment itself is checked separately by GitHub Actions.
