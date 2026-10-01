# Island Table: graphics and motion research

The improved graphics and motion run in the original `/catan` layout, with the website's existing palette and typography. The experimental immersive page has been removed; old `/catan/play` links redirect to `/catan`, preserving room and hosting parameters. No main-branch merge is part of this work.

## Research and applied decisions

| Primary source                                                                                                                                                                                                                                                  | Finding applied in this implementation                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DesignCode: Build a Three.js Game with Fable 5.1](https://designcode.io/courses/build-a-threejs-game-with-fable-5-1)                                                                                                                                           | The accessible course metadata describes refining Ashfall with visual references. We used this as an art-direction reference. The lesson body was unavailable; no paid lesson techniques are claimed. |
| [Three.js: Rendering on demand](https://threejs.org/manual/pages/rendering-on-demand.html)                                                                                                                                                                      | Render at display cadence while the camera or an animation is moving; stop scheduling frames when idle. Resume correctly on resize, visibility changes and incoming events.                           |
| [Three.js: Optimize lots of objects](https://threejs.org/manual/pages/optimize-lots-of-objects.html), [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html), [BufferGeometryUtils](https://threejs.org/docs/pages/module-BufferGeometryUtils.html) | Batch static, compatible geometry; instance repeated forest, crop and sheep details. Detailed silhouettes should not require a draw call for every feature.                                           |
| [Three.js: Shadows](https://threejs.org/manual/pages/shadows.html)                                                                                                                                                                                              | Cache static shadow rendering and update when geometry changes; use inexpensive contact shadows for moving dice.                                                                                      |
| [Three.js: Responsive design](https://threejs.org/manual/pages/responsive.html)                                                                                                                                                                                 | Size the drawing buffer deliberately. Preserve native Retina resolution at rest; adapt only during sustained expensive motion and restore sharpness afterward.                                        |
| [Google: High-performance CSS animations](https://web.dev/articles/animations-guide)                                                                                                                                                                            | Animate transforms and opacity on the compositor. Measure card endpoints once and start native CSS animation at its server-time offset instead of seeking it from every React update.                 |
| [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)                                                                                                                                                     | Progress is based on elapsed time, not frame counts. A monotonic clock maintains motion across different refresh rates.                                                                               |
| [Xbox accessibility guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117)                                                                                                                                    | Keep reduced-motion alternatives, avoid automatic camera shake, and shorten distracting overlays while preserving readable outcomes.                                                                  |

## Art direction

A coherent miniature landscape replaces the noisy raster ground experiment: asymmetric mountain ridges, sculpted fir crowns, aligned wheat rows, recognizable sheep, layered island sides and small wooden sailing boats. Original geometry and procedural materials are local. There are no external texture or model requests. Dice continue to throw directly onto the island.

Active games now fit a desktop viewport: compact player tiles on the left, map and private hand in the center, and illustrated purchases on the right. The large instruction panel and duplicate building controls are removed. On narrow phones, purchases form a compact bottom row. The map contains camera controls and normalized turn buttons; trading opens a native modal with clickable illustrated quantities and bank/port ratios. Resource cards keep crisp SVG faces with restrained paper depth, rather than adding a second WebGL scene.

## Timing

These durations are implementation choices, not vendor-prescribed standards. Shared constants in `src/lib/catan/motion-timing.ts` coordinate server gates, Three.js and CSS.

| Sequence                   | Previous |  Revised |
| -------------------------- | -------: | -------: |
| Roll lead + dice motion    | 3,700 ms | 1,150 ms |
| Opening countdown + reveal | 8,500 ms | 3,400 ms |
| Dice motion itself         | 1,800 ms |   850 ms |
| Build arrival              |   650 ms |   320 ms |
| Robber travel              |   900 ms |   420 ms |
| Award transfer             | 2,600 ms | 1,200 ms |

Resource flights last 620 ms with 45 ms staggering and a limited visible card count. Active tables poll their room every 400 ms without also fetching the lobby each time; hidden tabs back off to five seconds. Successful commands immediately adopt the returned authoritative room, avoiding a redundant read before controls unlock. Hidden cards remain hidden in transit.

## Measurement limits

Performance is measured against the prior renderer with the same viewport and interaction workload. Headless Chromium here uses ANGLE SwiftShader, a software GPU: its frame times are useful for relative regression checks, not a claim that physical devices achieve a specific frame rate. Hardware, screen resolution and the number of players still affect throughput. Development diagnostics are exposed only in development on the board host as `__catanGraphics`.

### Measured results (October 1, 2026)

A 1440×1000 browser viewport at device pixel ratio 2, orbiting a four-player island:

- **Native Chrome / ANGLE Metal / Apple M5 Pro:** median render interval 16.6 ms (about 60 fps), p95 18.4 ms; median CPU submission 0.8 ms, p95 2.1 ms. DPR stayed at 2 throughout.
- **Actual dice sequence:** 139 rendered frames across the throw and result display; median interval 16.7 ms, p95 26.8 ms at DPR 2 on the same native GPU. A screenshot/viewport visibility recovery regression was reproduced and fixed during this check.
- **Scene cost:** 570 → 261 draw calls in the comparison workload (54% fewer). Static shadows were not redrawn during orbit.
- **Idle:** 15 → 0 renders over the same 1.8-second observation window.
- **SwiftShader comparison:** median render interval 182.3 → 105.2 ms, p95 251.5 → 168.8 ms. This software-renderer result is a stress comparison, not the native-hardware rate.

These are local measurements, not a guarantee for all devices. Motion resolution can adapt within a three-million-pixel rendering budget after sustained slow frames; it recovers as throughput improves and restores the idle pixel budget when motion stops.

## Compact-table production sequence

Normal rolls use deterministic event-seeded landing positions, travel, spin and bounce variation. After dice settle, every hex that actually pays resources receives a 1,150 ms camera visit: 300 ms to focus, then 800 ms card flights with 65 ms staggering. The camera pulls back between visits and returns to the previous framing over 450 ms. User camera input cancels the automatic tour; reduced motion suppresses camera travel. Public events allocate exact paid quantities per hex and recipient, including city yields, robber blocking, and resource-bank shortages.

The single-screen layout was checked at 1440×900 and 390×844 with no page overflow. Trading, development play, supply selection and resource flights were exercised through real local API rooms; existing user test tables were preserved.
