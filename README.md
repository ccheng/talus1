# Talus Test Versioner

**Live application:** https://ccheng.github.io/talus1/

Talus is a client-side assessment authoring and test versioning application. No hosted account or backend is required.

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
