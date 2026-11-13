# Talus repository instructions for incoming coding agents

**Read before modifying code:**
1. [docs/HANDOFF.md](docs/HANDOFF.md): current product vision, accepted release baseline, code map, known limitations and new-chat handoff prompt.
2. [docs/QUALITY_GATE.md](docs/QUALITY_GATE.md): required approval, red/green regressions, CI, deploy and independent Work-mode QA gates.
3. [docs/MILESTONES.md](docs/MILESTONES.md): status table; proposals are **not** implemented/approved.
4. [docs/MILESTONE_2D.md](docs/MILESTONE_2D.md): next prioritized AI-assisted import direction, open questions and non-negotiables.
5. [README.md](README.md): detailed historical implementations. Older “future work” lines are not current status; verify live code.

## Product invariants

- Teacher creates and ultimately polishes assessments in Word / Google Docs. Talus interprets/reviews, seeded-versions and exports editable Word; **do not** turn it into a Word clone by default.
- Browser-only, local storage/JSON, static GitHub Pages. No server, hosted LLM API, credentials or auto-sharing without owner approval.
- Never change deterministic generation (question slot appears once per version; proficiency/section constraints; alternatives, choice mapping, key correctness, run ID and manifest) as a side effect of import/format changes.
- Original assessment wording, numbers, answers, equation semantics, media bytes and tables must not silently mutate.
- Imported untrusted content/model output must pass schema/integrity checks; unresolved critical warnings block generation even after restore/acknowledgment.
- **AI-assisted import is prioritized but not yet implemented.** Proposed first stage: external-model annotation exchange using source references, strict Talus validation and teacher review. Local inference follows only if approved.

## Working agreement

- Verify current default branch HEAD, release state and tests before claiming anything is deployed.
- No scope changes without owner approval. Implement on a branch/PR, no unrelated refactoring.
- Add **failing tests before fixes** where feasible and keep them permanently. Preserve all earlier import, math, Word, pagination, and persistence coverage.
- Required gates: `npm test`, `npm run build`, `npm run test:e2e`, CI green, successful main Pages deploy, **separate independent live black-box QA**, and explicit closure.
- Original classroom fixtures/evidence may contain private material: avoid committing them without consent. Use compact synthetic regression recreations.
- Report states accurately: proposed → approved → implemented → CI green → deployed → independently accepted. Developer must never self-certify external acceptance.
- After each milestone provide an independent Work-mode acceptance prompt with exact fixture, run, versions, outputs and failure-evidence expectations.
