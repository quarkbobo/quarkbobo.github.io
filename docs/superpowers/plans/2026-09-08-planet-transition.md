# Planet transition refinement

The user requests refinement of the approved planet experience, specifically its transitions. Keep the existing content, models and interaction scope.

Observed causes: moving the canvas into a fullscreen stage immediately changes planet framing; camera time is capped frame delta while the mask uses an independent CSS animation; first-time interior creation/shader compilation occurs at the scene seam; return closes abruptly.

Implementation: use one elapsed-time timeline for a 2600ms entry. Match the homepage's projected planet position and size at the opening frame with a uniform canvas transform, expand into fullscreen, accelerate through the atmosphere, switch scenes while fully covered, and settle the interior camera while revealing controls. Prepare/compile the interior on entry intent and before the flight. A 720ms return covers the interior switch then shrinks the exterior back to its original position. Escape/close during entry cancels immediately; reduced motion and paused motion skip transitions. No timers may revive a closed scene. Hide the page without causing scrollbar reflow.

- [ ] Add pure transition math tests for exact endpoints, full mask at seam, unified progress, smooth arrival, and opening-frame projection mapping.
- [ ] Implement entry/return timeline and lifecycle in planet-flight.mjs and planet-explorer.mjs.
- [ ] Replace CSS mask animations with timeline variables; preserve reduced motion and modal accessibility.
- [ ] Verify uninterrupted entry, cancel midflight, pause, return, mobile continuity and reduced motion in browser.
- [ ] Run appropriate regression checks, inspect the transition and review changes.
