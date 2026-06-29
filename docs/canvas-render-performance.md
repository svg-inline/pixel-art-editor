# Canvas render performance

TASK-011 replaces full pixel scans during editor painting with layer versions,
dirty rectangles and cached frame composition. Export paths continue to use a
fresh, cache-independent render.

## Reproducible benchmark

Run:

```bash
npm run benchmark:render
```

The benchmark covers the three project sizes from the task. It compares the
full CPU compositor with warm cached editor renders. Canvas API calls are
stubbed so the result isolates JavaScript pixel/composition work and remains
reproducible in Node; browser paint time is intentionally not presented as an
FPS claim.

Baseline measured before TASK-011 on Node 24 / Windows:

| Project | Full compositor | Warm cache (batch) | Gain |
| --- | ---: | ---: | ---: |
| 256x256, 2 layers, 4 frames | 0.884 ms/frame | 0.5 ms / 160 renders | 288.9x |
| 256x256, 8 layers, 16 frames | 2.918 ms/frame | 0.5 ms / 128 renders | 763.8x |
| 256x256, 16 layers, 64 frames | 5.789 ms/frame | 1.6 ms / 128 renders | 585.1x |

Numbers were recorded on 2026-06-27. Absolute timings vary by machine; the
cache-hit assertions and dirty-pixel counts are deterministic.

The automated tests also verify that a one-pixel edit paints and composites a
one-pixel rectangle, that unchanged frames hit the cache, and that multiple
consumers (main canvas, onion skin, thumbnail or preview) can independently
consume the same dirty-region history without forcing a full recomposition.

## Design limits

- The persistent project format remains arrays/RLE; `Uint32Array` is used only
  for the transient RGBA canvas buffer.
- Layer and frame caches use LRU bounds (192 and 128 entries) to cap browser
  memory in large projects.
- Immutable edits made outside the hot painting path are detected by a safe
  pixel diff. After 64 unconsumed changes, a lagging cache falls back to a full
  render rather than risking stale output.
