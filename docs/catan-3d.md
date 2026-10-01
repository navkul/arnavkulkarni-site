# Three-dimensional table

The default board is a local Three.js scene, loaded only when a table is open. The lobby still uses the site's cream/blue palette and IBM Plex Mono. The renderer combines local geometry and procedural canvas materials; card illustrations are original SVG. The `/catan` lobby retains the site's palette and font; active games use a compact table with a player column, central board and hand, and illustrated supplies. Old `/catan/play` links redirect to `/catan` with their room and hosting parameters preserved. See [graphics research](catan-graphics-research.md) for the subsequent art and performance pass. There are no remote image, font, model, or texture dependencies for the game.

Drag the island to orbit, zoom to inspect pieces, or reset the view. Legal build sites have both pointer targets and keyboard buttons. Buildings are selected from the supply images, then placed on the map. Zoom/reset and turn actions live inside the map. WebGL initialization failure silently falls back to the accessible flat board; there is no view toggle. Trading and special card choices use keyboard-accessible native dialogs. Each port has two raised wooden paths leading to its two eligible coastal corners. Supply buttons use cached transparent images rendered from the actual 3D piece models, with inline artwork as a WebGL fallback.

## Welcome and table identity

The welcome page has a short SVG/CSS harbor scene: a sheep rider delivers the wordmark, a rival makes a comic entrance, and two ships arrive over the usable create/join forms. It plays once per browser session, supports skip/replay, and honors reduced motion. No extra WebGL context or animation loop is needed for the lobby.

Waiting seats and in-game player tiles show profile portraits with an initials fallback. The sound button appears only on the current user's tile. A table owns one Web Audio context, unlocked by a user gesture, with a mute switch and a bounded decoded-clip cache. New reactions play once; joining/reconnecting never replays old events. Leaving closes the context. See [MDN Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices) for the gesture and playback lifecycle guidance.

## Motion coverage

| Moment               | Visual feedback                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Opening              | Staggered island assembly, terrain reveal, number discs, first-player dice                        |
| Setup                | Site previews, settlement drop, road growth, next-player cue                                      |
| Roll                 | Colored dice; producing tiles highlight after the dice settle                                     |
| Production           | Camera visits each paid hex in order; cards travel to each receiving player                       |
| Seven                | Dice settle before discard dialogs or robber targets; returned cards travel face down to the bank |
| Robber / knight      | Choose the destination on the map, then a player in the dialog; face-down stolen card             |
| Build / upgrade      | Wooden pieces arrive on the board; spent resources travel to the bank                             |
| Bank / player trade  | Directional card transfers; an illustrated give/receive offer                                     |
| Development purchase | Face-down card travels from the deck to the player                                                |
| Development play     | Public card reveal; free roads use normal placement motion                                        |
| Turn / phase         | Active-player border, map heading and compact action announcement                                 |
| Awards               | Award card moves to the player's badge                                                            |
| Pause / resume       | Saved/resumed announcement and persistent status                                                  |
| Win / end            | Winner announcement and confetti for a scored win; neutral close for an ended table               |

Resource flights last 1.05 seconds; production camera visits allow 1.5 seconds per hex. Animations follow authoritative server events. The room stores at most 48 visual events with stable IDs and timestamps, and clients ignore expired events. Polling does not create new events. Purchases, discards, and theft never expose a private card face. Reduced-motion preferences remove travel, spins, and confetti while retaining readable outcomes. Animation layers do not intercept game controls.

## References

- [CATAN 3D Edition](https://www.catan.com/catan-3d-edition): miniature terrain and tactile pieces.
- [CATAN 3D Almanac](https://www.catan.com/sites/default/files/2024-01/Almanac%20CATAN-3D.pdf): card meanings and resource themes.
- [CATAN Universe](https://catanuniverse.com/en/game/): digital tabletop presentation.
- [Colonist trade-interface study](https://blog.colonist.io/improving-the-colonist-trade-system/): clear giving/receiving direction and explicit bank ratios.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html) and [OrbitControls](https://threejs.org/docs/pages/OrbitControls.html): renderer and camera lifecycle.
- [Meng To's Three.js Catan video](https://x.com/MengTo/status/2097291240672993773): detailed low terrain, textured turquoise sea, rocky coastline, nearby hand, and contextual instructions. Reviewed frames across the full 87-second video. Dice throw directly onto the island, as requested.

All new illustrations and geometric models are authored in this repository; the references are design/rules references, not runtime assets.

## Earlier terrain experiment

An earlier pass used a 1536×1024 generated ground atlas with forest/clay/pasture and wheat/ore/desert swatches. It was created with the built-in image-generation tool. The art-direction pass replaced it with quieter procedural materials, so the unused atlas is no longer shipped. The original prompt is retained below for provenance.

Generation prompt:

> Use case: stylized-concept. Asset type: production texture atlas for a detailed Three.js medieval island board game. Create ONE rectangular 1536x1024 raster material atlas, exactly 3 equal columns by 2 equal rows, six 512x512 square material swatches edge-to-edge with NO gutters, NO borders, NO labels. Camera is perfectly orthographic straight down; each swatch covers natural ground at the same scale. Top left: rich dark mossy forest floor, fallen pine needles, earthy paths, tiny fern flecks, NO whole trees. Top middle: terracotta red clay hills ground, layered mineral sediment, tiny clay shale fragments and pale dusty tracks, NO pots or brick objects. Top right: lush soft green grassy pasture, subtle wildflower specks, natural meandering grass variation, NO animals. Bottom left: golden mature wheat field seen directly overhead, thousands of delicate fine golden stalks and subtly curved harvest furrows, NO oversized wheat icons. Bottom middle: weathered blue gray granite and slate mountain ground, fine rock cracks, gravel and sparse pale lichen, NO mountains or snowcaps. Bottom right: warm ivory sandy desert surface, wind-carved fine ripples and tiny scattered pebbles. Style: high quality hand-painted realistic strategy-game terrain, sophisticated natural color variation, detailed but not noisy, like finely crafted miniature landscape ground. Broad diffuse ambient lighting, no cast shadows, no horizon, no perspective, no bevels, no hexagons, no tokens, no text, no game UI, no watermarks. Each swatch is a continuous ground material that will be mapped onto raised hex tiles, not a scene illustration. Strong differentiation in natural colors, medium values, tactile painterly detail at close zoom.
