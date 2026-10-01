# Catan design pass — reference brief

Source: user attachment `a951d0cc-70c4-42dc-bc85-8a5130fabaf4/pasted-text-1.txt`
and its cream/blue/monospace website screenshot. Keep `feat/catan`; do not merge main.

Completion evidence must cover all of these requirements:

- Landing: official CATAN mark if obtainable; field names inside inputs, no sample text/icon;
  matching start/join buttons; contextual profile/login dropdown while typing a name;
  signed-in identity in the upper right with no dropdown.
- Seats: select/lock unique colors in the lobby, preserved through turn-order selection
  and reconnects. Every piece and die uses its owner's selected color.
- Cards: illustrated resource and development hands, card backs/counts for opponents,
  stacks instead of resource text, small played-card images only when played.
- Supplies: clickable development/building purchases, pictured resource costs,
  insufficient-resource feedback, bank and deck counts, personal piece inventory.
- Table controls: no Recent moves or At the table section. Pause/save at the top;
  any player can request, all other players must agree. All accepted moves remain durable.
- Awards: available army/road cards beside supplies; synchronized award animation,
  then compact badge beside recipient's played cards; VP count inside an icon.
- Opening: countdown, hex placement, flips, number-token reveal; everyone rolls
  for first player, ties reroll, highest first then clockwise/snake placements.
- Dice: prominent top roll control, shared server result/timestamp, colored 3D dice
  thrown onto the board. Late clients catch the shared timeline, not a new random roll.
- Board: improved original terrain/piece/card art; valid ports with resource images;
  no overlapping ports, labels, or boats. Responsive and reduced-motion behavior.
- Verify: engine/service invariants, independent-browser synchronization, privacy,
  desktop/mobile rendered review, production gates, offline/test-mode compatibility.

## Sources checked

- Official logo: https://www.catan.com/themes/custom/catan/logo.svg
  (bundled at `public/catan/catan-logo.svg`; mark belongs to CATAN GmbH).
- Official rulebook directory: https://www.catan.com/understand-catan/game-rules
- 2025 base rulebook, variable setup pp. 11–12:
  https://www.catan.com/sites/default/files/2025-03/CN3081%20CATAN%E2%80%93The%20Game%20Rulebook%20secure%20%281%29.pdf
- 2025 extension, variable setup p. 4 and paired turns p. 3:
  https://www.catan.com/sites/default/files/2025-03/CN3082%20CATAN%20%E2%80%93%205-6%20Rulebook%202025%20reduced.pdf
- Extension A–Zc numbers confirmed against illustrated spiral on p. 7:
  https://www.catan.com/sites/default/files/2021-07/catan-25th-rules_eng-200313.pdf

Use the official variable-setup counterclockwise alphabetical token sequences,
not unrestricted random token shuffling. Join order represents clockwise seating;
the highest opening roll starts, and tied highest rollers reroll. Early endings and
local/test games remain unranked. No opponent's unplayed card faces are revealed.

## Implementation and review evidence

- `catan-app.tsx` uses the official bundled mark, the site font/colors, input placeholders,
  matching create/join buttons, and a name-triggered profile dropdown. Signed-in players
  retain their identity in the upper-right corner. Browser profile registration/login and
  phone layout tests cover both identity states; `/tmp/catan-final-landing.png` captures
  the dropdown in the local preview.
- `store.ts` validates unique selected colors and locks them for the game. The opening
  roll rotates clockwise seating while retaining colors; tests cover collisions, locked
  edits, persistence, highest-roll ties, and the browser’s chosen Forest color.
- `cards.tsx`, `art.tsx`, `board.tsx` and `game-table.tsx` provide original illustrated
  resource/development cards, textured terrain, isometric pieces, inventory stacks,
  pictured costs, VP shields and small played-card images. Private faces never enter
  another player’s response. Supplies show zero counts and closed tables disable buys.
- Top controls support a request/agree/decline pause flow. Tests verify that guests can
  initiate it, duplicate/outsider votes fail, one missing vote keeps play active, a decline
  cancels, and unanimous approval pauses every browser. Moves remain durable.
- `table-flow.ts` persists opening/dice/award timestamps and results. Browser scenarios
  verify both awards moving to badges on two screens and identical colored dice results;
  reduced-motion dice use their final orientation without animation.
- Board setup follows the referenced token sequences. Rule tests check 600 random
  base/extended islands, correct port counts and distinct land endpoints. An additional
  2,000-board check verified consecutive discs follow a connected path through deserts.
- A fresh local development session verified the actual countdown → hexes → terrain →
  number-disc stages, plus a late client joining the completed timeline. Stage captures:
  `/tmp/catan-opening-hexes.png`, `/tmp/catan-opening-faces.png`,
  `/tmp/catan-opening-ready.png`. The dev server was restarted to load the new service code.
- Reviewed desktop/390px phone captures at `/tmp/catan-final-desktop.png` and
  `/tmp/catan-final-mobile.png`; no page errors, horizontal overflow, or overlapping
  port ship/label bounding boxes. Solo dev controls still open a stocked local game.
- Rule/service suite: 54 passing tests. Type checking, lint and formatting pass.
  Browser coverage includes multiplayer setup/reconnect, permissions, profile recovery,
  offline network isolation, hosting cookies, table-wide trades, early ending,
  production test-mode gates, and shared award/dice presentation.

All changes stay on `feat/catan` in the Catan worktree. No merge or deployment.

Final verification (2026-09-30):

- `npm run test:catan`: **54 passed** against the isolated `catan_test` database.
- `npm run test:catan:browser`: **9 passed**; a subsequent focused account scenario
  also passed Enter-to-sign-in and sign-out on the final UI.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, and `git diff --check`: pass.
- `npm run catan:prepare-local`: production standalone build prepared successfully.
  `npm run catan:local` was smoke-tested with external browser requests blocked:
  offline-only landing, locally served logo, color lock retained after reload,
  hidden solo-testing controls and zero ranked results.
- Pause approvals carry the particular request ID: simultaneous approvals combine
  safely, while an approval for an older request cannot apply to a newer one.
  Normal game actions retain strict revision checks.
- Award/dice/game captures from the full browser run were preserved in
  `/tmp/catan-design-evidence/`; staged opening and desktop/mobile preview captures
  are listed above. Dev preview remains at `http://localhost:3000/catan`;
  the prepared offline host is running at `http://localhost:3212/catan`.
