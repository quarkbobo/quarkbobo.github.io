# Fluid-particle final verification — 2026-08-30

This record captures the fresh, post-review verification of commit `3d6af44aecb6e786a5656a155af9cf370791c973` before integration into `master`.

## Build and behavior

- `npm test` completed a clean Hexo build and then the full Node/Chrome suite.
- Hexo generated 76 files.
- Node/Chrome tests: 90 passed, 0 failed, 0 skipped.
- `test/quark-blog-tools.test.ps1`: PASS under Windows PowerShell 5.1.
- The five complete standalone applications (`snake`, `国际象棋`, `中国象棋`, `image_transformer`, and `COCKY ZHOU`) matched their generated HTML byte-for-byte with SHA-256.
- All 16 current article images received their verified intrinsic width and height from the offline theme cache; no build-time network access is required.
- The feature worktree remained clean after verification.
- The main checkout status was identical before and after verification; its two user-owned untracked August source files were not staged, changed, moved, or deleted.

## Responsive browser checks

The visible in-app browser loaded the final local Hexo server. Each viewport had one particle Canvas, two particle scripts, a visible title and Saturn, and a 44px-high motion control.

- 320×740: client width 305px, scroll width 305px; 160 particles (134 dust, 21 glint, 5 streak).
- 768×900: client width 753px, scroll width 753px; 320 particles (269 dust, 42 glint, 9 streak).
- 1440×900: client width 1425px, scroll width 1425px; 320 particles (269 dust, 42 glint, 9 streak).
- 1920×1080: client width 1905px, scroll width 1905px; 320 particles (269 dust, 42 glint, 9 streak).

The client and scroll widths matched at every viewport, so no horizontal overflow was present. The 320px and 1920px renderings were also visually inspected after the final fixes.

At 320px, the long tutorial's table of contents was closed by default, appeared before the article, and exposed 44px summary and link targets. All 15 images on that page had numeric intrinsic dimensions.

## Foreground particle performance

The browser was made visible, reloaded at 1920×1080, and left in the foreground for 20.5 seconds. `window.__fluidParticleMetrics.snapshot()` reported:

- FPS: 136.2
- Average frame time: 7.34ms
- Frames over 24ms: 0%
- Particle count: 320
- Layer counts: 269 dust / 42 glint / 9 streak
- DPR: 1.0
- Quality level: 2 (highest)
- `document.hidden`: false

This exceeds the acceptance target of at least 55 FPS with fewer than 2% long frames while retaining every particle layer.

## Recovery and retirement gates

- The immutable pre-redesign backup remains at `C:\Users\Lenovo\Desktop\Quarkbobo-backups\Quarkbobo-before-redesign-20260828-211820`.
- Its 23,559 files / 426,167,100 bytes and key hashes were previously verified.
- All 8 post source files and both original desktop shortcuts have recorded recovery evidence.
- NexT retirement is limited to 302 tracked files under `themes/next theme/`; no unrelated source deletion is part of the feature diff.
- The desktop shortcut consolidation is a post-integration gate and must still be completed without running Publish.
