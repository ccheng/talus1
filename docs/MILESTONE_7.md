# Milestone 7 — Version receipts

The approved workflow gives a teacher a directly downloadable PDF and JSON receipt for the selected generated version. The receipt identifies the run, reviewed assessment section and question, alternative, generated question number, complete choice shuffle and correct letters. It identifies a Word question number only when retained from an unambiguous import. Students receive the existing version and run ID on their forms. Receipt downloads are separate.

The verification screen compares a chosen Word file with the SHA-256 hashes in a retained JSON receipt locally. A match identifies the exact bytes originally exported. An edited or unrelated copy yields a mismatch. The receipt supplies the recorded fingerprint, so the teacher should keep their own original copy. Receipt creation leaves the shuffle, existing run IDs, backup compatibility and ZIP manifests intact.

Acceptance should use a synthetic Word assessment with a confirmed group, an alternative, and a multiple-select item. Independently read the original and each Word student/key pair, compare the question map and every choice letter against the selected PDF and JSON receipts, and verify the matching run ID. Test an unchanged export, a renamed copy, a saved edit, a different version, and malformed JSON. Confirm the receipt is a PDF download and the student Word form does not contain the answer mapping. Record deployed SHA, sample, seed, version, matching files and failure evidence.

## 7.1 — Optional question marks on versions

The assessment-wide **Show marks beside questions** switch defaults off for new tests and older backups that lack a saved preference. It applies across versions and answer keys in the preview, browser print, Word and Markdown. Changing visibility preserves stored marks and the existing run ID, question order and choice order.

Acceptance uses an older assessment backup with one-mark and multi-mark questions. Check the default hidden state, visible labels on opt-in, student and key exports, and persistence across reload and backup restore. Compare numbering and run ID across both states.
