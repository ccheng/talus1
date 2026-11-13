# Talus 2D.2 feasibility

Use current desktop Chrome on Apple silicon macOS and Windows with a hardware WebGPU adapter that supports `shader-f16`. Use an approved synthetic fixture.

1. Run `npm install --no-audit --no-fund`, then `npm run feasibility:2d2`. Open `http://127.0.0.1:5173/talus1/feasibility/` in the target Chrome if needed.
2. Select **Download or load cached model**. Adapter checks run before the weight download. Record the initial load, then reload the page and load again for the cached setup measurement. Browser storage holds the pinned runtime artifacts.
3. Select a DOCX and **Run local annotation**. Save the timing evidence for every result, including failures. If it produces an annotation JSON, open the exact same DOCX in Talus's standard import workspace and review the JSON through the existing 2D.1 interface. Review any unresolved source mappings before acceptance.
4. Time the same review tasks with **Detect** on a fresh import of each fixture. Record corrected structure, answer keys, source fidelity, and elapsed review time for both paths. A validation or inference failure is a failed trial. A rehearsal with simulated model output verifies the plumbing only.
5. Repeat on both device classes. Preserve the exact model revision, browser, adapter, fixture fingerprint, per-call timings, token counts, and end-to-end elapsed time. Test cancel while a window is generating.

The experiment uses Qwen2.5-3B-Instruct-q4f16_1-MLC at Hugging Face revision `7690aaaa46df36b1be0fe93b9c9abac0497eff6c` with WebLLM 0.2.88's matching model library. It reserves 1,200 of the 4,096 context tokens for output and 64 for the chat wrapper. Whole source blocks retain their original IDs, each window includes up to 64 blocks, and consecutive windows overlap four blocks. The detached-key pass uses a compact index of source-backed questions. The existing 2D.1 validator is the final integrity gate.

The benchmark records whether the cached local path stays within 60 seconds and whether it improves review time on two of three fixtures, including one difficult fixture. The browser runner records model load separately from local annotation. Add the two durations if measuring from a cold page with a cached model. The harness is served by Vite in development and is excluded from the normal production build.

This prototype uses fixed four-block overlap, detects common detached appendix headings, and stops on conflicting window proposals. Adaptive overlap, uncommon appendix headings and in-app conflict resolution remain open if the benchmark shows they are needed. A context overflow or incomplete coverage is a recorded failed trial.
