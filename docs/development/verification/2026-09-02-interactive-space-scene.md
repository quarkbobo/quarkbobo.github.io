# Interactive space scene verification — 2026-09-02

## Scope and publication state

This record covers local browser acceptance, foreground performance, responsive screenshots, pause/reduced-motion behavior, and repository verification for the interactive space scene. It does not claim publication. Push, the GitHub Pages workflow, deployed URL discovery, and live-site verification remain pending for the controller after final review.

## Automated Chrome acceptance

The real-Chrome fixture in `test/theme-browser-behavior.test.cjs` now loads the real comet and planet runtimes at an explicit 1024×768 fine-pointer viewport. A temporary deferred helper pins only the planet core's base phase and supplies a timer-backed frame scheduler because headless `--dump-dom` does not advance compositor RAF after input. The helper and fixture are created per probe and removed in `finally`; no test clock or fixed phase exists in production.

The fixture dispatches the required center and outside pointer moves, reads the activated comet segment's phase and computed custom properties, and compares bounded 64×64 center patches captured with `getImageData()`. Browser assertions prove:

- the comet has eight reusable nodes, the overlay and all nodes are noninteractive, and one real segment becomes active at phase `1` with `comet-fade-b` plus populated x/y/length/angle/width styles;
- center hover changes real planet pixels;
- a primary-left center click produces a larger RGB difference sum than hover without another center move;
- the hover patch returns exactly to baseline after more than 240 ms and the impact patch returns exactly after more than 720 ms;
- a corner pointerdown outside the ellipse leaves the baseline unchanged;
- pause blocks both planet pixels and comet activation;
- reduced motion runs in a separate `runChromeProbe({ reducedMotion: true })` process, initializes one complete static frame, leaves the planet stopped, hides the motion toggle, and produces no continuous scene animation;
- the exact five-viewport geometry matrix passes, with full ring containment required only above 760px and the 390px mobile crop preserved.

TDD and focused verification evidence:

```text
Baseline: node --test test/theme-browser-behavior.test.cjs
Result: exit 0; 11 passed, 0 failed.

RED: node --test --test-name-pattern "fine-pointer comet and planet" test/theme-browser-behavior.test.cjs
Result: exit 1; 0 passed, 1 failed; pointerInteraction was absent from the existing fixture.

GREEN: node --test --test-name-pattern "fine-pointer comet and planet" test/theme-browser-behavior.test.cjs
Result: exit 0; 1 passed, 0 failed.

Rebuild: npm run clean
Result: exit 0.

Rebuild: npm run build
Result: exit 0; Hexo generated 83 files.

Chrome acceptance: node --test test/theme-browser-behavior.test.cjs
Result: exit 0; 12 passed, 0 failed.
```

## Foreground performance

Evidence directory:

`C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02`

The site was served locally at `http://localhost:4000/`, verified with HTTP 200, and controlled in the Codex in-app browser. The browser viewport was exactly 1440×900 and the document remained `visible`. Because the browser's host scale is 1.5 and its viewport capability does not expose device-scale emulation, a temporary pre-render local-only bridge set the renderer DPR to 1 and published main-world metrics to an invisible DOM data attribute. The bridge and emulation were removed before repository verification. The captured renderer snapshot independently reports `effectiveDpr: 1`.

After a 5200 ms warmup, the pointer held the canvas center for 20 completed draws. Browser Control then triggered one primary click and allowed 760 ms of decay. Exact `performance.json`:

```json
{
  "warmupMs": 5200,
  "hoverCompletedDraws": 20,
  "clickDecayMs": 760,
  "viewport": {
    "width": 1440,
    "height": 900
  },
  "devicePixelRatio": 1,
  "visibilityState": "visible",
  "snapshot": {
    "averageDrawMs": 2.6875,
    "p95DrawMs": 2.900000002235174,
    "maxDrawMs": 3.300000000745058,
    "over8msPercent": 0,
    "redrawFps": 27.587475286220037,
    "qualityLevel": 2,
    "canvasWidth": 344,
    "canvasHeight": 304,
    "effectiveDpr": 1,
    "initialized": true,
    "running": true,
    "fallback": false,
    "visible": true,
    "pageVisible": true,
    "basePhase": 3.454789334959744,
    "drawCount": 1069
  },
  "interaction": {
    "complete": true,
    "drawCount": 569,
    "averageDrawMs": 2.754481546554603,
    "p95DrawMs": 3.199999999254942,
    "maxDrawMs": 8,
    "over8msPercent": 0
  },
  "gates": {
    "complete": true,
    "hoverDrawsAtLeast20": true,
    "p95AtMost4Ms": true,
    "maxAtMost8Ms": true,
    "effectiveDprIs1": true
  }
}
```

The measurement is complete, p95 is below 4 ms, the maximum is exactly 8 ms, and no measured draw exceeded 8 ms.

## Responsive composition and visual review

Every required viewport reported the exact brand `政治月测后宫版V3/太空站`, one brand line, no navigation collision, exactly `particle-flow` and `planet-surface`, `planet-ready`, no horizontal overflow, and no copy collision with the visible planet or ring.

- 1440×900: desktop mode; ring left contained; right clearance 15.441375732421877px.
- 1280×720: desktop mode; ring left contained; right clearance 12.282371520996094px.
- 1024×768: desktop mode; ring left contained; right clearance 22.628082275390625px.
- 768×1024: desktop mode; ring left contained; right clearance 30.063140869140625px.
- 390×844: mobile mode; intentional right ring crop preserved; no horizontal overflow.

The eight saved PNGs were visually inspected. Desktop/tablet views preserve a legible copy column, complete restrained dust ring, fixed cool light, and clear copy/planet separation. The 390px composition intentionally crops the ring while keeping the brand, menu, copy, controls, and planet readable. Hover and click images show localized, restrained atmospheric changes without layout movement. The final paused image was captured at scrollY 0 after a complete repaint and retains the full header and hero composition.

Required screenshots:

- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\scene-1440x900.png`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\scene-1280x720.png`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\scene-1024x768.png`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\scene-768x1024.png`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\scene-390x844.png`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\paused-1440x900.png`

Additional interaction evidence:

- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\hover-1440x900.png`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\click-1440x900.png`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\performance.json`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\viewport-checks.json`
- `C:\Users\Lenovo\AppData\Local\Temp\interactive-space-scene-task-6-2026-09-02\pause-check.json`

The real pause control produced `motion-paused`, `aria-pressed="true"`, button text `继续背景动态`, two retained canvases, and zero active comet segments.

## Server and browser cleanup

The final capture server ran in managed terminal session `19227` and was stopped explicitly with Ctrl+C after capture (`INFO Have a nice day`). Exploratory sessions `56831`, `36857`, and `75507` were also explicitly stopped after their diagnosed setup limitations. The temporary Browser viewport override was reset and the agent-created browser tab was closed. No port-4000 server or browser test tab was intentionally left running.

## Complete repository verification

```text
npm run test:fresh
Result: exit 0; Hexo clean/build succeeded; 195 tests passed, 0 failed, 0 skipped, 0 todo.
```

`git diff --check`, pre-commit status, post-commit fresh verification, and the final clean-tree status are recorded in the Task 6 execution report.

## Publication gate

Pending. This task did not push or deploy. The controller must push the reviewed branch, wait for the `pages.yml` workflow for the exact pushed SHA, verify both `build` and `deploy`, query the actual Pages URL, and then verify the exact brand, two-canvas count, desktop ring containment, and 390px crop on the deployed commit.
