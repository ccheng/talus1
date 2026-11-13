# Proposed Milestone 2D — AI-assisted Word import (design handoff)

**Status: prioritized product direction, not yet built and not yet finally scoped.** This document captures decisions and proposals from the user/developer discussion; it is not permission to silently implement local inference, modify generation, or send documents externally.

## Why

Teacher works primarily in Word (or Google Docs, with DOCX handoff). Word remains the polished final-editing environment too. Today's deterministic importer needs manual review/repair for unusual numbering, section boundaries, question/choice segmentation, answer keys and scientific content. Goal: leverage LLM **interpretation** to mark which existing content belongs to which question/choice/key/section, without giving the model authority to rewrite or solve any assessment.

## Guiding architecture

1. In browser, import DOCX using the current extraction path, preserving original rich objects. Build **source-referenced blocks/spans**: stable IDs; order; original text; protected image/table/MathML references; source document fingerprint.
2. Either (a) export a self-contained annotation request/prompt for ChatGPT/frontier model and paste/upload its response, or (b) later generate the same response with a browser-local model.
3. The LLM outputs **structural references and labels**, not replacement HTML/text. E.g. question stem [B001], choices [B002..B005], existing answer [B006], section [B010]. Its role is identifying structure and reporting uncertainty; no content writing or question answering.
4. Talus parses/validates the response with a versioned schema; rehydrates text/equations/media from the locally held authoritative source objects. Check IDs, source fingerprint, coverage, duplicates/overlaps, choice/answer association, impossible classifications, cross-document reuse, malformed/hostile output, unsupported math/media, missing keys.
5. Display source side by side with candidate interpretation. Require explicit teacher review before acceptance and version generation.
6. **Existing deterministic seeded generator remains unchanged.** AI never selects the random version order, alternative rotation or answer-letter mapping. Existing export and persistence rules are maintained.

## Example annotation sketch — NOT final schema

Original extracted source:
```text
[B001] 101. Which substance is ionic?
[B002] A. H₂O
[B003] B. NaCl
[B004] C. CH₄
[B005] D. CO₂
[B006] Answer: B
[B007] 102. Explain why ...
```

Model's suggested interpretation (references only):
```json
{
  "format": "talus-annotation",
  "version": 1,
  "sourceFingerprint": "<the exact fingerprint provided by Talus>",
  "questions": [
    {
      "id": "q1",
      "type": "singleChoice",
      "stemRefs": ["B001"],
      "choiceRefs": ["B002", "B003", "B004", "B005"],
      "answerRefs": ["B006"]
    },
    {
      "id": "q2",
      "type": "writtenResponse",
      "stemRefs": ["B007"],
      "choiceRefs": [],
      "answerRefs": []
    }
  ]
}
```
This is illustrative, not yet a strict schema. Sections, provenance, ignored material, marks, grouped questions, alternatives, span boundaries, ambiguous detached keys and multiple select will need explicit definitions.

## Proposed submilestones

### 2D.1 — source-referenced contract + external LLM exchange (**next**)

**Include:** lossless/stable source-unit extraction; self-contained copyable prompt with rules/schema; upload/paste structured annotation; deterministic schema and source-reference verification; unresolved-coverage UI; side-by-side teacher review; no reliance on external credentials or network APIs; integration with current accepted import and six-version workflows; optional explicit metadata about model/source provenance; JSON backup and refresh behavior for staged work (define the contract first).

**Exclude:** automatic third-party API calls, storage of API keys, server processing, local model installation, solving/rewriting questions, autonomous acceptance/generation, direct Google Docs integration, new version-generator algorithm, general Word-equivalent authoring.

**Acceptance suggestions (owner approval pending):**
- An annotated import reconstructs original text, mathematical objects, image bytes/dimensions, tables, question/choice boundaries, sections/proficiency, original source keys and marks without corruption.
- Every source block or referenced subspan has an unambiguous disposition: consumed in one allowed role or deliberately declared non-assessment content. Reject silent omissions, overlaps and nonexistent references. Treat ignored content explicitly, visibly and audibly; define exceptions for decorations and headers/footers.
- Reject source fingerprint mismatch, schema/size violations, duplicate/reused choices, invented labels/keys, wrong key mapping, corrupt rich media or unsupported math, untrusted HTML, hidden content changes and stale backup import.
- If the source provides **no correct answer**, Talus cannot silently infer one. The teacher can add it through explicit existing authoring workflow.
- Ambiguous boundaries, detached answer keys, multi-question paragraphs, Word list-number fields, mixed inline math and table cells have realistic fixtures and review behavior.
- Malformed AI response does not alter the active master. Errors are actionable; teacher can retry or use the standard deterministic parser.
- After explicit acceptance, the existing six-version run produces **six student DOCX + six corresponding keys**, correct section shuffling, variants, letters, response space and unchanged original rich content; run manifest remains repeatable.
- Existing non-AI workflow, local backups and all 2C–3B regressions remain green.

**Open engineering questions:** precise source-block/span design; whether the exported annotation request serializes rich objects by reference only or embeds safe context representations; stable canonical fingerprint; how to bridge paragraphs containing several questions; correct choice labels when options share paragraphs; treating external LLM output as fully untrusted; which information is allowed in a prompt when user wants privacy.

### 2D.2 — optional browser-local inference (deferred)

Use **exact same annotation schema** as 2D.1. Evaluate compatible on-device inference libraries / WebGPU / hardware/model size, performance and cancellation; no model required for app to function. Download progress/opt-in, local-only claims and fallback need independent verification. Don't choose one technology in advance or assume every browser/device supports it.

### 2D.3 — targeted AI-versus-deterministic review (deferred)

Compare AI suggestions with deterministic parser and direct teacher attention to disagreements, incomplete key associations, uncertain section boundaries and rich-object placement. Preserve explicit accepted source and audit trail.

## Risks and design constraints

**Hallucination reduction ≠ eliminating all errors.** Reference-only schema prevents arbitrary replacement of source prose if validated, but an LLM may still point at the wrong span, misclassify an answer, or incorrectly omit material. Teacher review and deterministic checks are necessary.

**Prompt injection:** document contents may contain instructions directed at an AI. Treat document content only as task data; prompt is copied externally at the teacher's choice. Validate all model output without trusting its instructions or provenance claims.

**Privacy:** external frontier-model use may send the assessment to a third party. Explicit opt-in and warning; never automatically upload documents; never put student personal data in committed fixtures. Local inference is a distinct opt-in path.

**Determinism:** scope of reproducibility is version generation given an approved master and seed, not model interpretation. LLM proposals need not be deterministic; approval creates the canonical master.

**Security:** avoid unsafe HTML/MathML injection and resource fetching; fail closed for damaged media/maths; constrain source/annotation sizes to avoid browser hangs.

## Proposed independent Work-mode acceptance brief

> Independently test **only after live deployment** the approved Talus 2D.1 external-LLM annotation workflow using original awkward classroom DOCX fixtures and deliberate malicious/malformed annotation variants. Verify exact source provenance and rich content, all expected question/answer associations, warnings and repair behavior, teacher review/acceptance, refresh/JSON restore, deterministic six-version run, 12 editable Word files, manifests, and no changes to non-AI import. Inspect underlying content and rendered Word, not only UI. Deliver a PASS/FAIL matrix, defects with repro/evidence, and a release recommendation.

**Before writing code:** product owner and developer must finalize contract acceptance criteria and reconcile against actual import-parser structure. 
