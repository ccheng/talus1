# Talus Test Versioner

**Live application:** https://ccheng.github.io/talus1/

Talus is a client-side assessment authoring and test versioning application. No hosted account or backend is required.

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
