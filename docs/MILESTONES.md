# Talus milestones and next decisions

**Roadmap updated 2026-11-14 by product-owner decision.** The active future feature sequence is **4A → 5A → 6**. The status and evidence below distinguish what shipped from what independent QA verified. The [development history](DEVELOPMENT_HISTORY.md) preserves earlier implementation notes.

## Approved remaining roadmap (product direction, not implementation authorization)

The following stages are **approved for roadmap inclusion and priority order**, not approved as detailed implementation specifications. Before building each milestone, the developer must propose a bounded scope, non-goals, fixture-based tests and independent acceptance criteria for product-owner signoff. Maintain Word/Google Docs as the principal authoring and final-polishing environment; Talus is the structure interpreter, validator and deterministic versioner.

| Order | Milestone | Distinctive outcome | Status |
|---|---|---|---|
| 1 | **4A — Intelligent import of shared-content question structures** | Detect, associate, review and faithfully preserve shared source material and question relationships **from imported Word assessments** | Approved roadmap direction; not yet scoped/implemented |
| 2 | **5A — Word / Google Docs interoperability** | Improve the teacher's source-document → Talus → editable final-document workflow and content fidelity | Approved roadmap direction; not yet scoped/implemented |
| 3 | **6 — Production hardening and polish** | Reliability, compatibility, accessibility, performance, recovery and comprehensive release testing | Approved roadmap direction; final consolidation stage |

### 4A — Intelligent import of shared-content question structures

**Problem:** A Word assessment may contain a reading passage, a scientific diagram, a data table or multi-part stimulus that applies to several questions, with relationships and dependencies that are not explicit in ordinary text/number parsing.

**In scope to consider when formally scoping:** recognize these structures during standard and AI-assisted import; associate a shared passage/diagram/table/instructions with its child questions; preserve original rich content and its source provenance; present clear teacher review and corrections for uncertain associations; support nested or linked question relationships where feasible; retain correct grouping, numbering, answer keys and editable DOCX export across seeded versions. Define deterministic validation for missing, duplicated or wrongly linked source material.

**Explicit non-goal / 3C boundary:** 3C already implemented **manual authoring and management of consecutive grouped questions with shared material**, including grouping/ungrouping and internal shuffle. **4A must reuse that existing model/UI and must not rebuild or duplicate those authoring controls.** 4A's added value is *import-time recognition, source-linked structural interpretation, complex relationship fidelity and review*, not generic rich editing or a second group editor. The developer should first examine 3C/PRs #24–25 to identify the smallest missing capabilities.

**Acceptance direction:** realistic DOCX fixtures with a passage plus multiple questions, diagrams/tables with associated questions, detached instructions and ambiguous relationships; source-object byte/semantic fidelity; no omissions/duplicates; six reproducible student/key pairs; existing 3C grouping and all prior regressions green. Handle unsupported structures visibly and fail closed rather than guess.

### 5A — Word / Google Docs interoperability

**Goal:** Reduce the manual friction and fidelity loss between a teacher-authored source assessment, Talus's reviewed structure, and final editable Word/Google Docs documents.

**In scope to consider:** clearer import/export handoffs for DOCX created by Word or downloaded from Google Docs; improved preservation of common document structure, text formatting, equations, tables, embedded figures, answer-key layout and document styles; practical workflows for external final editing; investigation of narrowly defined round-trip changes and source identity preservation where feasible. Prioritize high-fidelity, predictable output over building a full in-browser word processor.

**Not automatically authorized:** direct Google account integration, remote APIs, cloud storage, automatic two-way live synchronization, invisible merge of externally changed documents, or exact print pagination parity across Word/Google Docs/LibreOffice. These require separate feasibility/privacy decisions.

**Acceptance direction:** original realistic Word and Google Docs-exported DOCX fixtures; compare source, imported Talus master, six student/key Word outputs and representative reopened/resaved files. Identify and test supported vs unsupported round-trip operations explicitly; preserve existing deterministic generation and rich-source invariants.

### 6 — Production hardening and polish (final scheduled stage)

Systematically audit what is already built rather than initiate another large feature expansion: regression completeness, production/deployment integrity, browser compatibility (including Safari and Firefox where supported), mobile/tablet usability, accessibility/keyboard operation, performance on substantial DOCX and local-model workflows, offline/error handling, local storage/backup/restore, failure diagnostics, security/privacy boundaries, and recovery from malformed documents or interrupted operations. Establish reproducible compatibility and performance baselines, prioritize observed defects, and independently verify production with classroom fixtures.

**Acceptance direction:** risk-based release matrices and real-device/browser evidence; source fidelity and generated-answer integrity remain release-blocking; performance and accessibility checks have explicit targets; no regressions to accepted 1–3C workflows.

### Possible future work — **outside** the approved roadmap

- **4B — Advanced versioning constraints and balancing:** richer distribution/equivalence controls, placement constraints and auditing, only if concrete classroom requirements justify added complexity.
- **5B — Additional packaging/export products:** new delivery formats and reusable packaging/templates, only if users demonstrate need.

These are **backlog ideas, not scheduled milestones**. Do not implement or prioritize them as part of 4A, 5A or 6 without an explicit product decision.

## Current milestone status

| Milestone | Purpose | Status / evidence |
|---|---|---|
| 0 | GitHub repo, static Pages hosting, CI | Complete |
| 1 | Assessment model, seeded versioning, section shuffle, alternatives and exports | Complete |
| 1.1 | ZIP, persistence, run IDs, restore, stale generation and response-line fixes | Complete |
| 2A / 2B | DOCX/Markdown/text/HTML import and author review | Complete |
| 2.1 | Corrective import parsing/warnings/keys | Complete |
| 2C.1 | Images, tables, malformed/linked media validation | Corrected, independently retested |
| 2C.2 | Scientific math/OMML/MathML import and fail-closed validation | Corrected, independently retested |
| 2C.3 | Rich-content review/editing | Corrected, independently retested |
| 3A | Editable DOCX student/key export | Corrected, independently accepted |
| 3B.1 | Professional pagination/styles | Corrected, independently accepted; 3B1-04 continuation cases passed |
| 3B.2 | Word layout controls/persistence | **Accepted and closed**; initial P3 3B2-01 corrected, focused retest passed, regression-hardened PR #17 merged |
| **2D.1** | Source-referenced annotation exchange with teacher review | **Deployed and independently passed** after the corrective release. [PR #19](https://github.com/ccheng/talus1/pull/19) · [PR #20](https://github.com/ccheng/talus1/pull/20) · [Tested deployment](https://github.com/ccheng/talus1/actions/runs/43369804567) |
| **2D.2** | Optional WebGPU inference using the 2D.1 contract | **Deployed.** Independent production smoke verified opt-in and fallback when WebGPU hardware was unavailable. Real-model acceptance remains open. [PR #21](https://github.com/ccheng/talus1/pull/21) · [Tested deployment](https://github.com/ccheng/talus1/actions/runs/43442665443) |
| **2D.3** | Source-linked Detect and AI comparison, with teacher reconciliation | **Deployed and independently passed** after correcting the competing-key resolution flow. [PR #22](https://github.com/ccheng/talus1/pull/22) · [PR #23](https://github.com/ccheng/talus1/pull/23) · [Tested deployment](https://github.com/ccheng/talus1/actions/runs/43447895921) |
| **3C** | Manual authoring and management of consecutive groups sharing rich context | **Deployed and independently passed** after grouped run-ID restoration and compact Word pagination fixes. [PR #24](https://github.com/ccheng/talus1/pull/24) · [PR #25](https://github.com/ccheng/talus1/pull/25) · [Tested deployment](https://github.com/ccheng/talus1/actions/runs/43494560488) |

## Independent evidence and outstanding verification

The following QA files are held outside Git. Request them from the owner or QA when reproducing a case.

| Milestone | Evidence and scope |
|---|---|
| **2D.1** | `acceptance-report.md` and `talus-2d1-live-acceptance.zip`. The corrected fixture passed rich source preservation, missing and ambiguous key handling, invalid-input protection, and repeatable Word exports across six student/key pairs. QA used a synthetic source and a hand-authored, source-valid annotation. |
| **2D.2** | `2d2-production-smoke.md`, `2d2-production-smoke-word.zip`, and `benchmark-and-oracle.md`. The smoke passed on managed Linux Chromium without a hardware WebGPU adapter, including deterministic and external-annotation fallback and six Word pairs. Real-model quality, successful cancellation during real inference, cached/offline inference, and timing and review-time targets on Chrome on Apple silicon macOS and Windows desktops are unverified. Use the [feasibility harness](../feasibility/README.md) for target-device trials. |
| **2D.3** | `2d3-live-acceptance.md` and `2d3-live-evidence.zip`. The corrected build surfaced conflicting keys, kept acceptance blocked after an unrelated edit, allowed explicit reconciliation of the supported source, and produced six correctly keyed Word pairs. Agreement stayed quiet. QA used a source-valid stand-in for the AI proposal. |
| **3C** | `3c-live-acceptance.md` and `3c-live-evidence.zip`. The corrected run preserved run ID `1vq0qac` and reproduced its manifest on JSON restore. The shared passage, PNG, merged table, native fraction and first grouped child appeared on the same page in all 12 student/key copies rendered in LibreOffice. Desktop Microsoft Word pagination remains unverified. |

## Actual 3B.2 acceptance baseline

Independent Work-mode accepted functionality after testing live production 2026-11-12. 72 DOCX across settings batches, 427 rendered pages, all tested Word layout controls, state persistence, generation invariance, and Word/Markdown parity passed. Original 3B1-04 Q12 continuation test: 13/13 off-prompt-page items had cues, plus 61 additional examples.

The P3 3B2-01 label/rule wrapping finding was corrected in PR #16 and independently focused-retested **PASS** on both problematic layouts; permanent test `e2e/acceptance3b2-identity.spec.ts` introduced. PR #17 test-only strengthened content and key exclusions; merged commit `a50c70852a5237aa45d637f760d8999891caaaa3`. The original Work-mode report and evidence packages are not in Git; ask the owner for them if an exact reproduction is required. Separate what the external tests establish from what CI establishes.

## Product strategy and next approval

Teachers author and finish assessments in Word or Google Docs. Talus interprets source structure, validates a teacher-reviewed master, generates seeded variants and exports editable Word. The next deliverable is a bounded 4A scope proposal with non-goals, fixture-based tests and independent acceptance criteria for owner signoff. Follow the [quality gate](QUALITY_GATE.md) and retain the outstanding 2D.2 verification as a separate record.
