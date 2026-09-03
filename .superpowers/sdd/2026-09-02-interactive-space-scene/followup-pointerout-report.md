# Follow-up pointerout remediation report

## Root cause

The window-level `pointerout` handlers in `cursor-comet.js` and `planet-surface.js` checked only `relatedTarget`. A touch or pen exit with `relatedTarget: null` therefore cleared transient state created by a mouse. `blur` remains unconditional.

## RED evidence

After adding the focused regressions and before production edits:

`node --test test/cursor-comet-contract.test.cjs test/planet-renderer-contract.test.cjs`

Result: exit 1; 67 passed, 2 failed. The cursor regression reported `touch: 0 !== 2` for active comet segments. The planet regression reported touch `pointerout` output equal to baseline where it expected the mouse hover to remain active. These failures directly exercised the unguarded handlers.

## GREEN verification

- `node --test test/cursor-comet-contract.test.cjs test/planet-renderer-contract.test.cjs` — 69 passed, 0 failed.
- `node --test test/theme-browser-behavior.test.cjs` — 12 passed, 0 failed.
- `npm run test:fresh` — Hexo clean/build succeeded; 202 passed, 0 failed, 0 skipped, 0 todo.
- `git diff --check` — exit 0.

## Files changed

- `test/cursor-comet-contract.test.cjs`
- `test/planet-renderer-contract.test.cjs`
- `themes/fluid-particle/source/js/cursor-comet.js`
- `themes/fluid-particle/source/js/planet-surface.js`
- `docs/development/verification/2026-09-02-interactive-space-scene.md` (suite count 200 → 202)

## Commit

Commit SHA: pending until commit.

## Concerns

None. No layout, mobile policy, visual constants, dependencies, particle sources, or unrelated lifecycle behavior were changed. Nothing was pushed or published.
