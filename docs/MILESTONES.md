# Talus milestones and next decisions

This file is the **current high-level status** as of 2026-11-12. The chronological [README](../README.md) contains full engineering history. Source and current GitHub PR/CI take precedence over historical prose.

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
| **2D.1 (proposed)** | Source-referenced AI annotation contract and external-LLM copy/paste import | **Selected as next direction, not implemented; formal acceptance details awaiting owner signoff** |
| 2D.2 (proposed) | Optional in-browser local model using 2D.1 contract | Deferred; feasibility/device compatibility to evaluate |
| 2D.3 (proposed) | AI/deterministic parser comparison and ambiguity-focused review | Deferred |
| 3C (proposed) | Further authoring organization/rich editing | Not prioritized/approved |

## Actual 3B.2 acceptance baseline

Independent Work-mode accepted functionality after testing live production 2026-11-12. 72 DOCX across settings batches, 427 rendered pages, all tested Word layout controls, state persistence, generation invariance, and Word/Markdown parity passed. Original 3B1-04 Q12 continuation test: 13/13 off-prompt-page items had cues, plus 61 additional examples.

The P3 3B2-01 label/rule wrapping finding was corrected in PR #16 and independently focused-retested **PASS** on both problematic layouts; permanent test `e2e/acceptance3b2-identity.spec.ts` introduced. PR #17 test-only strengthened content and key exclusions; merged commit `a50c70852a5237aa45d637f760d8999891caaaa3`. The original Work-mode report and evidence packages are not in Git; ask the owner for them if an exact reproduction is required. Separate what the external tests establish from what CI establishes.

## Product strategy

The authoring workflow is **Word-first** (Google Docs is an alternative; export/download as DOCX when needed). Talus should be a dependable assessment structure interpreter, validator, seeded versioner, and **editable** Word exporter. Avoid building a complete Word clone. Important prioritization choice: **return to 2D AI-assisted importing before pursuing further 3C editor work**.

## Forward milestone discipline

2D is intentionally split into contract and safe external-LLM exchange (**2D.1**), optional browser-local integration (**2D.2**), and deeper comparison/review (**2D.3**). These are *proposals* from the scoping discussion, not authorization to implement all three. Details and open decisions are in [MILESTONE_2D.md](MILESTONE_2D.md).

Each milestone requires owner's scope signoff, red/green tests, a production deployment gate, separate live Work-mode acceptance, and regression capture before closure.

## Open decisions, not implied decisions

- Final 2D.1 annotation schema/version and source-block granularity; treatment of mixed rich content, partial paragraph ranges and heading/answer lists.
- What teachers may designate as “ignored” source material, and which ambiguities block vs need explicit review.
- How to deliver a frontier model the complete information without encouraging content rewriting; whether to allow the full source DOCX attachment alongside the block extraction.
- Local model choices and performance budgets; deferred until 2D.1 is accepted.
- Google Docs integration scope: there is no direct hosted Google Docs sync/import commitment. DOCX export/import is supported.
- Future milestones after 2D not committed; 3C only an option.

## Next developer deliverable

**Not a bulk implementation.** Produce a bounded 2D.1 specification with threat model, annotation example, schema/validation rules, UI sequence, failure-handling matrix, fixture plan and independent acceptance prompt. Get owner's agreement and only then code the first thin vertical slice.
