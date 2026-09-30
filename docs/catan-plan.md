# Catan implementation and verification

Worktree: `../arnavkulkarni-site-catan`, branch `feat/catan`.

## Scope

- Website entry at `/catan`, with shared Postgres storage for internet and LAN players.
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

Use Vercel for the website and API, hosted Postgres for shared state, and Vercel
Queues for durable simulation dispatch. Each move and its immutable job snapshot
commit in one transaction. Short writes are serialized across instances; expensive
simulations run outside transactions. Duplicate/out-of-order results are safe.
Clients never receive other hands, future deck order or authentication secrets.

Rules references: [base game](https://www.catan.com/understand-catan/game-rules),
[paired turns](https://www.catan.com/sites/default/files/2021-09/CATAN_New5-6Player_ruleEN.pdf).
Use original CSS/SVG artwork, no copied game assets.

## Original LAN implementation audit — 2026-09-30

The following records the original LAN version before the Vercel migration.
Current deployment instructions are in `docs/catan.md`.

| Requirement                                              | Authoritative evidence                                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New worktree and logical commits                         | `feat/catan` in `../arnavkulkarni-site-catan`; separate engine, services, interface and verification commits                                                                                                                                                                         |
| Website entry and same-Wi-Fi multiplayer                 | `/catan` route and desktop/mobile home navigation; three independent browser contexts join and synchronize; production listener binds `0.0.0.0`; HTTP page and create/leave API verified through host network interface `10.239.43.8:3211`                                           |
| 3–4 and 5–6 player games                                 | Engine topology/supply/setup tests for all four sizes; complete policy-played games reach legal winners for all four sizes; browser tests use three and six independent sessions; paired-turn sequencing and restrictions tested for five and six                                    |
| Full base-game actions                                   | Rules tests cover placement/distance, roads/cities/costs/limits, dice/production/shortages, discards/robber/theft, ports, domestic offers/consent, every development card, awards/ties/interruption and hidden-point victory; controls route all actions to the authoritative engine |
| Post-first-game name/password profile                    | Browser performs winning city action, creates profile and sees saved win; service tests reject premature registration and duplicate names, check salted password storage and session rotation                                                                                        |
| Future login and personal stats                          | Fresh browser login restores account; browser renders personal game history; service tests confirm game-count/win-count/history values and persisted results                                                                                                                         |
| Automatic leaderboard results                            | Winning action and result inserts share one database transaction; duplicate result keys; browser confirms 100% win rate for its new profile                                                                                                                                          |
| Anonymous opponents still count                          | Service tests verify anonymous aggregate appearances/wins, own-result claiming and private history; browser/API check excludes guest display names from profile history                                                                                                              |
| Profile pause/resume and later recovery                  | Browser pauses and resumes from a fresh authenticated context; service reconnects to storage, logs in, resumes and compares the unchanged game snapshot                                                                                                                              |
| Server full-information win probability and move changes | Actual rollouts use the same rules engine and complete games; evaluation tests verify normalized deterministic probabilities, revision/delta/terminal behavior and nonmutation; browser confirms published odds; SVG history and delta panel visually inspected                      |
| Hidden state and action authority                        | Private projections tested for every seat and outsider; route denies outside observers and cross-site writes; stale revisions, wrong actor/host, unconsented trades and malformed actions tested                                                                                     |
| Mobile and existing website                              | Desktop game, mobile lobby and mobile game screenshots visually inspected; phone overflow assertions; 22 existing website Playwright tests pass                                                                                                                                      |

Final verification:

- `npm run test:catan`: **36 passed**.
- `npm run test:catan:browser`: **4 passed**, including production build.
- `npm run test:e2e`: **22 passed** across desktop and mobile.
- `npm run typecheck`, `npm run lint`, changed-file Prettier check and
  `git diff --check`: passed.
- Node reports its expected experimental SQLite/type-stripping notices.
- Direct LAN-interface smoke test returned HTTP 200 and successfully created and
  removed its own verification lobby. Physical second-device Wi-Fi/firewall
  configuration remains host-environment dependent.

## Vercel migration

The server uses PostgreSQL and a transactional job outbox, with queue retries and
idempotent result commits. Service tests additionally race independent database
connections for seat capacity, move revisions and rate limits, and verify snapshot
persistence and out-of-order odds repair. Browser fixtures use isolated Postgres.

Operational limits are documented in `docs/catan.md`: small-game write throughput,
queue beta status, guest cookie retention, no password recovery, and experimental
Monte Carlo estimates. Hosted provisioning/deployment requires Neon marketplace
terms acceptance; deployment verification is tracked separately from local tests.

### Migration verification — 2026-09-30

- 38 rules/service tests passed against Postgres, including independent-connection races.
- Four Catan browser tests passed against a production build and isolated Postgres.
- 22 existing site browser tests and two Strava-outage tests passed after incorporating
  the latest `main` dependency changes.
- Typecheck, lint, changed-file formatting and dependency audit passed.
- A Vercel preview connected three independent sessions, started a game, accepted a
  legal placement and completed both immutable snapshots through the hosted queue.
  The test removed only its own room, jobs and sessions afterward.
- GitHub CI now provisions isolated Postgres and runs both Catan suites.
