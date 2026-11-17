# Milestone 8 — Build identity, question numbering, and shuffle diversity

## Approved scope

- The header shows the application release and the short Git commit of a published build. A local build identifies itself as local.
- New generation runs default to numbering by question type. Multiple choice and select-all share the plain numeric sequence. Explicit numerical response uses NR1, NR2, and so on. Short answer and written response share WR1, WR2, and so on. Numbering continues across sections, independently for each sequence. Continuous numbering remains an option.
- Labels are assigned in generated order and appear consistently in the preview, print, Word and Markdown exports, keys, continuation cues, and receipts. A shared prompt uses the actual generated labels of its questions.
- New runs prefer question layouts that increase the separation of the closest pair, subject to the assessment's section, pinning, and group constraints. The same inputs, seed, and generation settings reproduce the same layouts. Existing saved runs restore with their original generation algorithm, labels, and identifiers.

## Acceptance

1. Compare the header's build ID with the deployed commit.
2. Generate a synthetic test containing MC, select-all, NR, and written responses across sections. Compare the labels in preview, Word, Markdown, and receipts, including a mixed-type shared stimulus. Repeat with continuous numbering and compare physical order and choices.
3. Generate three versions of a synthetic test with six independent two-question shuffle sections and eight pinned questions. Measure the number of slots in different positions for each pair and compare the closest pair with the legacy run. The fixture can separate each pair by eight positions. Check the pinned positions and the keyed answers.
4. Restore a saved pre-Milestone 8 run. Verify its run ID, question order, choice order, and original numeric labels against the saved evidence. Verify the newer settings survive backup and restore.

Use invented questions, keys, and stimuli for automated and independent acceptance fixtures. Private classroom assessments and their exports stay outside the repository.
