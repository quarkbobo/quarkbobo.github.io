# 2026-09-27 controlled follow-up

The immediate baseline repeat confirms that the earlier cross-run comparisons cannot establish shader speedup or slowdown. The unchanged preserved baseline scene became 34–70% slower in desktop fixed views than the first run. The source module hash remained identical. The cause of the time-dependent system variation was not established; no thermal, clock, or hardware attribution is claimed.

| Fixed view | Initial baseline median ms | v2 median ms | Immediate unchanged baseline repeat ms |
|---|---:|---:|---:|
| Desktop station | 13.1 | 12.6 | 18.7 |
| Desktop planet | 9.7 | 12.4 | 16.1 |
| Desktop star-a | 13.5 | 11.4 | 18.1 |
| Mobile-size station | 13.5 | 17.5 | 20.0 |
| Mobile-size planet | 9.2 | 12.3 | 16.5 |
| Mobile-size star-a | 11.0 | 13.3 | 16.2 |

- [v2 report and screenshots](perf-after-v2-2026-09-27T03-55-50-857Z/report.json), scene SHA-256 `a8a597cad08e25f3c00be8bac8bb105af62cba573d4de338d25c348c6ffada7b`.
- [Immediate baseline repeat](perf-baseline-repeat-2026-09-27T03-57-49-888Z/report.json), preserved scene SHA-256 `adc541d2178f6d977ae7aa4b7658229fba9d426f2028af455d981c70dcc29e41`.

All six v2 fixed screenshots were inspected: no blank scene, regular noise stripe, or obvious nebula seam/facet edge was seen in these directions. The white granulation is softer than v1 and the three star colors remain distinct. v2 uses 13 geometries and one texture in these views, with zero console/shader errors. These observations do not imply a proven shader performance gain.

## Same-page CSS A/B/A

[Diagnostic report](perf-compositor-2026-09-27T03-59-02-618Z/report.json) and [reproduction script](perf-compositor.cjs).

One 1440×900 production homepage remained in station view and continued its normal physics, events, particle rendering, and clock. Each phase measured three consecutive 2.5-second windows. B injected only this temporary style; A2 removed it:

```css
#three-body-canvas, .tb-body-labels span { will-change: transform; }
```

| Phase | Computed style | Actual render FPS range | Mean FPS |
|---|---|---:|---:|
| A1 | auto | 5.59–6.79 | 6.13 |
| B | transform | 11.57–13.17 | 12.24 |
| A2 | auto | 6.38–7.19 | 6.78 |

The improvement appears when the style is enabled and reverses when it is removed, supporting a compositor-layer explanation more directly than comparisons across separate runs. B is about 1.8–2.0 times the A-phase mean FPS in this measured desktop/software-rendering case. This ratio is not a claim about other devices or camera modes.

`Performance.getMetrics` was collected around all nine windows. Full script/task/layout/style/heap measurements are in the report. Simulation and running clocks continue in each phase, the selected view stays `station`, and no error is recorded. Natural dust weather occurs during B and the beginning of A2; its actual strengths are recorded rather than disabled or hidden. The continuously evolving scene and weather mean this is an operational A/B/A, not identical-pixel GPU microbenchmarking.

The injected style was removed at completion (`stylesRemoved: true`), the isolated browser was closed, and no production file was edited. Because the CSS diagnostic showed a useful effect, the conditional extra shader A/B/A was not run.
