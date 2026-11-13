# Talus development quality and release gate

**Purpose:** separate product decisions, implementation, and independent black-box acceptance. This is a proposed operating protocol for the new developer workflow, based on the successful 2C–3B process. The user retains final authority to change it.

## Roles and boundaries

| Role | Owns | Must not do |
|---|---|---|
| Product owner (human) | Vision, scope, acceptance criteria approval, prioritization; approves substantive product changes | Required to relay every debugging/test iteration |
| Developer chat / Codex | Understand repo, implement, write reproducible regressions, run CI, document release | Quietly expand scope; declare independent acceptance for its own code |
| Independent QA Work-mode chat | Live production black-box testing with original fixtures, independent exports/rendering, exact evidence and PASS/FAIL | Repair code, use developer reasoning as substitute for observed evidence |
| Coordinator chat (optional) | Track handoff, assign signed-off scope/test briefs, summarize evidence and release decisions | Assume it can programmatically control other chats or has their private context |

**Proposed maximum autonomous repair loop:** one planned milestone implementation, one independent test cycle, developer fix with permanent regressions, focused independent retest. Escalate to user if the fix affects architecture, content semantics, roadmap, or material scope, or if the loop would repeat beyond one correction cycle.

## Definition of Ready (milestone)

Before implementation, record:
1. Problem, teacher workflow and explicit user outcome.
2. In-scope functionality, out-of-scope, unchanged invariants, API/data schema and compatibility.
3. Test fixtures (especially real DOCX), expected behavior and deliberately invalid cases.
4. Observable acceptance criteria and deployment/test instructions.
5. Risk and privacy/security considerations.
6. Approved priority and whether the milestone is implemented incrementally.

## Test-first implementation requirements

1. Reproduce defects with source inputs/evidence. Add a regression that fails **before** the fix when practical; record failure/bug identifier.
2. Keep fixed fixtures small, attributable, safe to commit; avoid importing user documents containing personal/student data. Original external evidence remains with user/QA; tests should recreate the smallest relevant structure unless consent to commit fixtures is explicit.
3. Prefer deterministic unit tests for parsing, schema integrity, source references, generation and persistence; Playwright for UI/backup/export; OOXML assertions for Word semantic integrity; LibreOffice/Poppler rendering for pagination. Test actual outputs, not just button clicks.
4. Validate failure paths: malformed math, missing source blocks, corrupt media, missing keys, mismatched backups, refresh and restore, alternatives, seed reproducibility and run immutability.
5. Run `npm test`, `npm run build`, `npm run test:e2e`, plus any specific renderer or security tests. GitHub workflow `.github/workflows/deploy.yml` is mandatory.
6. PR includes scope summary, tests added, local/CI PASS/FAIL, limitations, evidence provenance, migration risk and rollback instructions. Review diffs to avoid drive-by unrelated changes.

## Release gates

**G0 Scope:** product owner approved goal and criteria; no unauthorized pivot.

**G1 Development:** all tests pass and no known P0/P1 defects; errors/unsupported source content fail closed. If the regression test itself is broken, fix the test rather than weakening expectations.

**G2 Merge/deploy:** PR merged only on green CI. Current GitHub Actions tests/builds on PR and push to main and deploys only after main test-and-build succeeds. Confirm the **main workflow deploy job** and live production site, not only the PR check.

**G3 Independent acceptance:** QA uses the **deployed public URL**, original real fixtures and separate browser/session, independently downloads/inspects student/key exports and provides severity-ranked defects, repro steps, screenshots and artifacts. The developer's interpretation of source and tests is not QA evidence.

**G4 Corrective release:** developer translates confirmed failures into permanent regression tests; focused retest of affected cases plus risk-based adjacent cases. Do not repeat massive acceptance matrix when narrow correction and no collateral evidence warrant it, but broaden on a detected regression.

**G5 Closure:** independent QA passes, owner accepts, release docs updated, baseline commit/deployment recorded, outstanding nonblocking risks and next milestones explicitly distinguished.

**Status vocabulary:** `proposed`, `approved`, `implemented`, `CI green`, `deployed`, `independent acceptance pending`, `accepted/closed`. Never collapse these states into “done.”

## Defect severity

- **P0 / release-blocking:** lost/corrupted question or answer, incorrect version/key, generation despite unverified source corruption, unsafe content.
- **P1 / normally blocking:** substantial workflow failure, incorrect question/answer association, persistence/import breaks, material pagination ambiguity.
- **P2:** relevant functional or fidelity impairment with workaround; decide acceptance explicitly.
- **P3:** limited cosmetic/ergonomic issue (e.g. historical 3B2-01), may be accepted with tracked corrective work.

Severity must reflect observed consequences; tester reports facts, not speculative causation.

## Evidence/report contract (one package per test run)

- Environment, date, deployed URL, visible build/commit if verifiable, browser, document renderer/version.
- Original fixture name and SHA-256 if feasible; source/reference data must be traceable.
- Run ID, seed, versions, exact layout settings and state transitions.
- A results matrix mapping every acceptance criterion to PASS/FAIL/NOT TESTED.
- For each defect: unique ID, priority, exact reproduce steps, expected/observed, screenshots/console/trace/source XML/rendered PDF as appropriate.
- 6 versions + 6 keys where required; manifest, JSON backup and rendered pages; machine-checkable audit script where beneficial.
- Explicit acceptance recommendation and scope limits (e.g. Word Desktop untested).
- No claim that the test succeeded unless a concrete action/result supports it.

## Handoff between chats

- Share repository branch, PR, commit, current milestone contract, live build URL, original tester prompt and evidence ZIP/report.
- Developer can see summarized QA findings but **must not feed a corrected answer to black-box QA** or ask QA merely to rubber-stamp its tests.
- The product owner should need to intervene only for scope/vision decisions, exception acceptance, or repeated failure cycles; orchestration is a process, not automatic cross-chat control.
- Persist changes in Git, not a chat's ephemeral memory.

## Stop conditions

Stop deployment and escalate for hallucinated/invented answers, unexpected content mutation, unreferenced rich media, incorrect student/key pairing, broken generated-run determinism, unacknowledged source omissions, data loss after refresh/backup, security/privacy regressions, or unrepeatable acceptance conditions.
