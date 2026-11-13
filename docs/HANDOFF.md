# Talus development handoff — current entry point

**Prepared:** 2026-11-12 (America/Edmonton). **Audience:** incoming developer ChatGPT/Codex agent and independent Work-mode QA agent. **Repository:** [ccheng/talus1](https://github.com/ccheng/talus1). **Production:** https://ccheng.github.io/talus1/.

> **Start here, then read [QUALITY_GATE.md](QUALITY_GATE.md) and [MILESTONES.md](MILESTONES.md).** Read [MILESTONE_2D.md](MILESTONE_2D.md) before proposing 2D implementation. The detailed README is a chronological changelog and contains historical passages whose “future work” descriptions are now stale. Current status below takes precedence over older README passages; current code is the ultimate authority. Verify GitHub main, CI and deployed commit before modifying anything.

## Product vision / user constraints

Talus is a **client-only assessment versioner for teachers**, not a substitute for Word/Google Docs. Teachers primarily author and fine-tune in Word (or Google Docs exported to DOCX), import into Talus, identify/review questions and answer associations, generate equivalent randomized versions, and export **editable** Word for final finishing. No application backend, cloud database, external document upload, or compulsory AI service is in scope.

**Non-negotiables:** deterministic/pseudorandom seeded generation with auditable run ID and manifest; section/proficiency-aware question shuffling; each source question slot once per version; alternative variants per slot; choice/answer-letter consistency; preserve text/numerals, chemistry, mathematics, source tables and image data; no silent document losses; editable student DOCX and correct paired keys; browser-local autosave and portable JSON. The teacher must review imports. AI interpretation must **never** author new question wording, solve missing keys silently, or generate versions.

## Present baseline (accepted, not a promise about future work)

- **Milestone 0 / 1 / 1.1:** repository, GitHub Pages deployment, master test schema, sections/slots/variants, seeded versioning, student/key/ZIP/manifest, local persistence, JSON backup, validation, corrections.
- **2A / 2B / 2.1:** DOCX/Markdown/plain text/HTML and pasted input, deterministic question/choice/key/section detection, import review and editing, warnings, safe acceptance.
- **2C.1:** embedded raster images/tables and integrity warnings.
- **2C.2:** supported Word OMML → MathML conversion and fail-closed scientific/equation handling.
- **2C.3:** constrained rich-content review/editing, protected equations/media, table cell editing.
- **3A:** native editable DOCX export for student and answer key; six-version ZIP produces 12 DOCX plus manifest. 3A acceptance defects corrected.
- **3B.1:** professional document styles, identification fields, pagination protections and rendered continuation cues; acceptance defects corrected.
- **3B.2:** configurable Letter/A4, margins 0.5–1.5 in, 9–14pt, line spacing, section breaks, 2/4/6 response-line groups, headers/footer; persistent settings do not mutate the run. **Independently accepted** on 2026-11-12: 72 rendered DOCX / 427 pages; follow-up P3 3B2-01 identity label/rule wrapping corrected and focused independent retest **passed**. Permanent tests added; last test-hardening PR **#17** merged (commit `a50c70852a5237aa45d637f760d8999891caaaa3`). The independent Work-mode evidence packages are external to Git; do not claim they are committed.
- **2D AI-assisted import:** **NOT implemented.** Product direction discussed and prioritized; implementation requires an approved acceptance contract and scoped milestone. See [MILESTONE_2D.md](MILESTONE_2D.md).
- **3C / advanced visual authoring:** only floated as a proposal, not approved; do **not** unilaterally pursue it.

**Last verified main at handoff preparation:** prior to handoff branch, PR #17 merge commit `a50c708...`. Check latest main and production for subsequent changes instead of freezing this identifier as permanent truth. Last completed PR test-hardening was test-only. Do not conflate a green PR test with independently verified deployment.

## Code map (verify contents before editing)

| Concern | Paths |
|---|---|
| Application UI/workflow | `src/App.tsx`, `src/ImportWorkspace.tsx`, `src/Editor.tsx`, `src/style.css` |
| Master data schema and validation | `src/model.ts` |
| Deterministic parsing | `src/importParser.ts` |
| Word conversion, math, rich safety | `src/wordMath.ts`, `src/media.ts`, `src/equationSafety.ts`, `src/contentIntegrity.ts`, `src/richNodes.tsx` |
| Version generation | `src/generate.ts` |
| Editable Word export | `src/docxExport.ts` |
| Other exports | `src/export.ts` |
| Browser storage and JSON | `src/storage.ts` |
| E2E fixtures, acceptance regressions | `e2e/`, especially `e2e/acceptance3b1-rendered.spec.ts`, `e2e/docx3b2.spec.ts`, `e2e/acceptance3b2-identity.spec.ts` |
| Test/deployment pipeline | `.github/workflows/deploy.yml`, `playwright.config.ts`, `package.json` |
| Detailed historical chronology | `README.md` |

**Master model:** `MasterTest.schemaVersion:1`; sections contain question slots and optionally groups, slots contain complete alternative variants, variant types `singleChoice`/`multipleSelect`/`shortAnswer`/`writtenResponse`. Generated snapshot includes count, seed, runId, sourceUpdatedAt, and per-version manifests mapping slot/variant/choice order. `wordLayout` is separately stored export configuration. Validate and retain backwards-compatible JSON.

**Stack (package.json):** React 19 + TypeScript/Vite 7, Vitest, Playwright, TipTap/ProseMirror, Mammoth, Marked, Zod, fflate, Dexie, DOMPurify. Browser-only static hosting using Vite base `/talus1/`. Do not add server/API requirements without explicit product authorization.

## Known limitations and guardrails

- Deterministic Word detection cannot correctly infer all messy numbering, answer-key blocks, tables/diagrams, and question boundaries. Original source and teacher review remain authoritative.
- Some complex Word math/objects/shapes/linked images are unsupported; reject or warn explicitly. Supported raster media have size caps (historical limits: 1 MiB/image, 2 MiB total unique images, 3.5 MB JSON backup; verify current implementation before quoting).
- Rich editor is constrained; it is not a full Word-equivalent editor or arbitrary equation/table designer.
- LibreOffice and Microsoft Word may paginate differently. Current CI targets desktop Chromium/Chrome and Writer-rendered test scenarios; native Word/Safari/Firefox/device coverage is not guaranteed.
- Local browser storage is not cross-device sync; backups are essential.
- Invalid source math/media and unresolved warnings must not be bypassed via “verified” acknowledgments or saved/restore paths.
- Historic “no Word import/export” language near the README bottom predates later milestones and is obsolete.

## Incoming developer: first actions

1. Read these four handoff files, README, the named source modules, and latest GitHub PRs/issues/CI. Confirm the exact main SHA and publicly deployed build.
2. Restate the **product vision**, current accepted baseline, and **what is NOT implemented**, particularly 2D. Inspect actual tests before assuming historical claims.
3. Propose Milestone **2D.1** acceptance contract and implementation plan; seek the user's **milestone-approval decision** before broad implementation. Avoid changing generator behavior while developing AI parsing.
4. Follow the red → green → independent acceptance process in [QUALITY_GATE.md](QUALITY_GATE.md). Do not mark any milestone “accepted” based solely on developer tests.
5. Use a dedicated feature branch/PR with reviewable commits, precise status reports, regression evidence and no unrelated refactors. No silent work across separate ChatGPT chats.

## Handoff to a new developer chat

Suggested first message:

> You are the incoming Talus developer. The repo is `ccheng/talus1`. Read `docs/HANDOFF.md`, `docs/QUALITY_GATE.md`, `docs/MILESTONES.md`, and `docs/MILESTONE_2D.md` **directly from GitHub**, then inspect `README.md`, key source files and current CI. Confirm current main/deployment and summarize the accepted 3B.2 baseline, non-negotiable product invariants, unresolved limitations, and proposed 2D.1 contract. Do not implement until we agree on the scope and acceptance criteria. Work in a separate branch using test-first development; independent black-box Work-mode QA, separate from developer context, gates every release.

## Decision authority

User owns product vision, prioritization, user-visible interpretation, and acceptance of new milestones. Developer owns technical implementation/proposed tests; independent black-box tester owns external acceptance evidence; neither may self-certify the other's role. A coordination chat can summarize handoffs, but **separate chats do not automatically share hidden context or run each other**. Persist decisions/specifications in Git and explicitly supply test briefs/evidence links to the independent tester.
