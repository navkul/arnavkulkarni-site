# Catan implementation and verification

Worktree: `../arnavkulkarni-site-catan`, branch `feat/catan`.

## Scope

- Website entry at `/catan`, accessible to multiple devices through one LAN server.
- Rooms with invite codes, private per-seat hands, reconnects, 3–4 and 5–6 players.
- Full base game: randomized island, ports, snake setup, production/bank shortages,
  robber/discards/theft, builds, domestic/maritime trade, all development cards,
  longest road, largest army, 10-point victory. Extended island, supply and deck;
  paired turns for 5–6 players.
- Guests may register after completing their first game and claim their own result.
  Password login, durable sessions, profile-owned seats and saved games.
- Durable automatic result recording, public profile leaderboard and aggregate
  anonymous participation; private game history and performance statistics.
- Server-only full-information Monte Carlo win estimates with move deltas/history.
  Estimates describe a simulated policy, not solved or calibrated human odds.
- Browser verification across independent seats and phone layouts, rules and
  persistence/security tests, production build, lint and type checks.

## Implementation chunks

1. Rules engine and tests.
2. Durable rooms, identities, sessions, statistics, private API and simulation.
3. Responsive game board, lobby, profiles, leaderboard and website navigation.
4. Integration/browser verification, fixes and operating documentation.

## Decisions

Use a single Node server with SQLite on persistent local storage. This supports a
LAN host and a persistent website host; ephemeral/serverless replicas require a
shared backend and are not a supported deployment. All game actions are validated
and committed atomically with revision checks. Clients never receive other hands,
future deck order, authentication secrets or simulation internals.

Rules references: [base game](https://www.catan.com/understand-catan/game-rules),
[paired turns](https://www.catan.com/sites/default/files/2021-09/CATAN_New5-6Player_ruleEN.pdf).
Use original CSS/SVG artwork, no copied game assets.

## Evidence / remaining work

Implementation in progress. No completion claim until all scope above has direct
runtime and test evidence. No earlier implementation existed at the initial audit.
