# Catan game night

Open `/catan` from the website navigation. Enter a table name and your name, choose **3–6 seats** in Settings, and share the six-character room code, and have each player use their
own browser/device. The host starts once the minimum number of seats is filled.

## Hosting on Vercel

Deploy this Next.js project to Vercel and open `/catan` on the public domain. Players
can join from any internet connection; the host's computer does not need to stay on.

1. Connect a hosted Postgres database (for example Neon through Vercel Marketplace).
   Set `CATAN_DATABASE_URL` to its pooled connection URL in the intended deployment
   environments. Use a separate database for previews when testing with fixtures.
2. Deploy the project with the checked-in `vercel.json`. It registers the
   `catan-evaluations` queue consumer at `/api/catan/evaluate`.
3. On first database access the app creates only its own `catan` schema and tables,
   under a migration lock. Existing website tables are untouched.
4. Verify room creation/joining from independent browsers and wait for a started
   game's probability estimate. Inspect Vercel function logs if jobs are delayed.

Vercel Queues is currently a beta service. Its SDK uses deployment credentials;
there is no public endpoint accepting arbitrary simulation state. A queue failure
never rolls back a player's accepted move. Pending jobs survive redeployment and
are redispatched when the table is opened or polled (after a ten-minute retry window).

## Settings and offline hosting

Online hosting is the default. The landing page uses the main site's font, colors,
and minimal layout: Start a table, Join a table, and an embedded leaderboard.
Settings contains an optional win-probability switch, a 3–6 seat slider, and Self-host.
Disabling probabilities prevents simulation jobs from being created, as well as
hiding their panel. Five and six seats use the extended board.

Self-hosting requires a laptop/desktop local server; a browser tab cannot become a
LAN web server. Players can join from phones on the same Wi-Fi or hotspot, without
internet. Prepare the offline host **once while online** (Node 22.13+ required):

```sh
npm ci
npm run catan:prepare-local
```

Then, even without internet:

```sh
npm run catan:local
```

Open `http://localhost:3212/catan?hosting=local` on the host. The terminal and game
show its Wi-Fi address; other devices open that address, then use a code or **Find
local tables**. Discovery lists tables on that host, rather than scanning the LAN.
Allow the host through its firewall and avoid guest networks that isolate devices.
Keep the server running during play. Closing a browser tab does not stop the host.

The prepared `.data/catan-host` folder is portable to a computer with compatible
Node 22 installed; run `node start-local.mjs` inside the copied folder. It includes
the built UI, fonts, assets and server dependencies. It does not require Postgres,
Docker, cloud credentials, or npm installation during offline play. Preparing again
replaces only the bundle and preserves `.data/catan-local.sqlite`. Environment files
are excluded from the portable bundle, and the launcher removes cloud credentials.

Local games support guests and separate profiles saved on that host. They never
create leaderboard/results rows. Accounts, pictures, recordings and games are saved
in `.data/catan-local.sqlite`; set
`CATAN_LOCAL_DATABASE_PATH` to override the path. Any seated player can request a pause;
every other player must agree. Any seated player can resume a paused table.
Local and online sessions use separate cookies, so switching modes keeps both seats.
A local result is never uploaded or merged into online stats.

For development, set `CATAN_DATABASE_URL` to a development Postgres database in
`.env.local`, then run `npm run dev:lan`. Online mode stays the default, and Self-host
switches to separate local storage. On Vercel, choosing Self-host shows the setup
link; Vercel cannot serve games after the players lose internet access.

## Storage and identity

- For online games, PostgreSQL stores rooms, sessions, profiles, results, probability history, and
  evaluation jobs. `CATAN_DATABASE_URL` is server-only; never prefix it with `NEXT_PUBLIC_`.
- Room actions, final results, revisions and evaluation snapshots commit atomically.
  A PostgreSQL advisory transaction lock serializes short writes across instances;
  revision checks reject stale moves. Simulations run outside the write transaction.
  This intentionally favors correctness for small game nights over high write throughput.
  Local writes use SQLite transactions and a request mutex.
- Game state persists after every accepted move, including an in-progress discard
  or robber phase. Restarting the server does not require restarting the game.
- Session cookies are HTTP-only, SameSite=Lax, and Secure when served over HTTPS.
  Session secrets are stored hashed. Passwords use salted scrypt hashes.
- Anyone can create a username/password profile at `/catan/profile` before playing.
  Existing unclaimed completed results attach only to that guest's profile. Signing
  in later recovers the profile's seats, including on another device. Usernames stay
  fixed; editable display names appear in seats, games and the leaderboard.
  `/catan/profile?hosting=local` manages a separate account on the local host.
- Any seated player can request **Pause & save** from the top controls. The game
  continues until all other players agree; any player can decline the request.
  Accepted moves are already saved, whether or not the table is paused.
  In mixed guest/profile games, guests retain their seats through the same browser cookie. Guests should
  keep that cookie until they have created a profile or finished playing.
- There is no password recovery flow or email collection. Keep your password.
- Configure backups/retention with the Postgres provider. Legacy local SQLite files are not imported into online stats.

## Rules and controls

The island, ports, pieces and development deck follow the base game and extended
supplies. Terrain is shuffled; the official alphabetical number-disc sequence is laid
counterclockwise from a randomly chosen corner, spiraling inward and skipping deserts.
Players choose unique colors in the lobby and can lock their choices. Starting locks
the assigned colors for the game. A three-second countdown precedes tile placement,
terrain flips and number discs. Each player then rolls for first player; tied highest
rollers reroll. The highest starts and the others follow clockwise seating order.
The initial placements follow forward/reverse order; the second settlement supplies
starting resources. Colors stay with the player when the turn order rotates.

Use highlighted spots on the SVG island or the location dropdown. Cities upgrade
settlements. Road Building uses a two-road preview and an explicit confirm button.
The robber can be selected on the board or from a hex list, followed by a victim
when applicable. Trades require the recipient to accept a current offer.

5–6 players use **paired turns**: after the primary player's full turn, the player
three seats ahead gets a build/development/bank-trade turn. That player cannot roll
or trade with another player. Then both positions advance one seat. Both turns can
win, and a card bought in an earlier paired/primary turn is available on the next
turn. Victory is checked only for the player currently taking their turn.

References: [official rules](https://www.catan.com/understand-catan/game-rules) and
[paired-player rules](https://www.catan.com/sites/default/files/2021-09/CATAN_New5-6Player_ruleEN.pdf).
The island uses original SVG terrain illustrations and harbor ships; development cards
have illustrated faces and a clickable draw pile. These assets are bundled locally.
The turn banner names the active player and puts Roll dice / End turn above the board.
Dice use six CSS 3D faces in the roller’s color. The server stores each result and its
presentation timestamp; all clients follow that timeline, including a reconnect partway
through the animation. Reduced-motion settings show the final state without movement.
Resource/development hands use card faces; opponents see backs and counts. Purchases
show card costs and remaining piece/deck inventory, and the bank shows each resource
supply, including zero. Unaffordable purchases explain the missing resources.
Longest road and largest army cards wait beside the supplies until awarded, then
animate to a small badge beside the winner’s played cards on every connected screen.

Trade offers can target one player or **Whole table** (the default). Any other player
who can pay can accept a table offer; the first accepted transaction closes it for
everyone. Revision checks prevent two players from claiming the same offer.
Played development cards appear as small public card images under each player.
Unplayed cards and victory-point cards stay private. Older saves retain their knight
count; they cannot reconstruct card history from before this feature.

The host can choose **End game**, then confirm **End game for everyone**, to close
a starting, active or paused table early. The saved board remains viewable, but moves stop.
This declares no winner and does not create results or change stats. Normal games
still end automatically when a player legally reaches 10 points on their turn.

## Statistics and anonymity

Completed online results automatically enter the server's durable statistics database.
The public leaderboard shows display name, games, wins, win rate, and average
points. Ranking uses win rate, then number of games, then average points. It also
shows aggregate anonymous appearances and wins, without guest display names.

The profile page shows completed games, wins, win rate, average points and recent
results. Its private API also retains performance by table size, resources produced,
trades, robber theft/loss, discards, building counts and development purchases. Opponents without profiles are labeled **Anonymous** in
history, while their scores/outcomes still count. Starting pieces count toward
building totals; each paired action phase counts as a turn. Completed records are
inserted once per seat, so retries do not duplicate leaderboard results.

## Profile pictures and recorded sounds

The profile page accepts a picture from the device or camera, crops it to a square,
and saves a 320px JPEG. Pictures appear in the lobby and in each in-game player box;
guests use initials. Media is stored in PostgreSQL (online) or SQLite (local), never
in Vercel's temporary filesystem. Additive `profile_preferences` and `profile_media`
tables preserve existing accounts. Opaque media URLs keep binary data out of room
poll responses. The API accepts JPEG/PNG/WebP images and WebM/Ogg/MP4 audio, checks
container signatures and rejects media above 256 KB.

Sounds can only be created from the microphone in the interface; there is no audio
file picker. Recording stops after five seconds and releases the microphone. This
requires microphone permission plus HTTPS or localhost. A profile can save ten
sounds and activate three, with both limits enforced transactionally by the server.
The player's own tile opens their active sound buttons. Reactions broadcast only
to seated players, with a six-second sender cooldown; a listener can mute table
sounds. Browser audio must first be enabled by a user gesture. Sound assets require
an owning profile or a shared table membership. Sound events expire after fifteen
seconds and do not advance the game revision or interrupt unfinished moves.

## Win estimates

The server runs full-information Monte Carlo rollouts after moves, retaining the
probability history and percentage-point changes. A stochastic policy uses actual
hands, development cards, board, robber, piece supplies and bank. It simulates legal
future dice, development play, robber decisions, bank trades and builds using the
same rules engine. Clients receive the resulting percentages, never another hand
or the future deck.

By default, each evaluation runs **32 simulations** with a **1,200-action horizon**.
Set `CATAN_SIMULATION_SAMPLES` between 8 and 256 to trade server time for lower
sampling variance. Evaluations yield during rollouts so requests can be served.
Queue deliveries can complete out of order and may trail rapid moves. Every move
has an immutable snapshot; retries are idempotent. Stored deltas are repaired against
the preceding evaluated revision, while the current estimate never moves backward.
The UI explicitly shows when an estimate is still updating.

A half-win prior per player smooths finite samples, so a nonterminal position does
not claim a certain winner or an impossible win from a handful of rollouts.

These are experimental policy estimates, not a solved game or calibrated human
win probabilities. The policy does not model human negotiation, alliances or
bluffing. At the horizon, unfinished games use softmax weights based on points,
resources and development cards. The UI reports how many rollouts reached a winner;
small deltas can be sampling noise. Finished games show the actual 100% winner.

## Verification

Tests require an isolated database named `catan_test`. For example:

```sh
docker run --name catan-postgres-tests -e POSTGRES_PASSWORD=catan-local-test \
  -e POSTGRES_DB=catan_test -p 127.0.0.1:55439:5432 -d postgres:17-alpine
export CATAN_TEST_DATABASE_URL='postgresql://postgres:catan-local-test@127.0.0.1:55439/catan_test'
npm run test:catan          # Rules, simulations, identities, persistence and privacy
npm run test:catan:browser  # Production build + independent Chromium sessions
npm run typecheck
npm run lint
npm run build
```

Service and browser tests clear the `catan` tables in `CATAN_TEST_DATABASE_URL`.
The guard requires the database name `catan_test`; never point it at real user data.
Run those suites sequentially. Browser tests use port 3210 and a separate
`.data/catan-browser-local.sqlite` for self-host checks. Local unit tests use temporary directories. Screenshots/traces are in `test-results/catan`.
The preexisting site browser tests remain available through `npm run test:e2e`.

## Solo testing in development

Run `npm run dev`, open `/catan`, and click **Open test table** below the create form.
No names, Postgres setup, Self-host toggle, or other browsers are required.
Opening a test table leaves the lobby’s hosting preference unchanged. Development keeps one
local test table; the same button reopens it until its host deletes it.

The table starts with your seat in the normal lobby. Click **Add player** for each
simulated player, up to six total seats. **View / control player** lets you choose
and lock each simulated player's color. Adding beyond the selected capacity expands
the table. Friends can also join open seats with the normal invite link.

**Start game** uses the regular board reveal, opening dice, settlement/road setup,
resource distribution, and game rules. Nothing is prebuilt or added to your hand.
After each move, control follows the next simulated player (including opening rolls
and discards). Real connected players control their own seats and private hands.
Use the player selector to accept a trade from another simulated seat. These players
are manually controlled, not AI opponents.

**Delete test table** is available in both the lobby and game. It clears the test
so you can start fresh. Test games save locally, never write results, and disable
probability jobs. This local entry point is available only in development. The separate TESTING entry
below exposes owner-only practice controls on deployed, unranked practice tables.

## Deployed practice table

Enter **TESTING** in Join a table, or open `/catan?room=TESTING`. The server creates
or reopens one private practice table for the current visitor. It opens straight onto
an unranked four-player board with legally placed starting pieces and normal resources.
The tester controls all four hands; turn control follows each move automatically.

**Restart setup** returns that same table to the color-selection lobby with one seat.
Add players up to six, choose colors, and start to test the normal reveal, opening rolls,
and settlement/road placement. **Delete test table** deletes only the tester's own
sandbox; entering TESTING again creates a fresh one. Other visitors get separate tables.
Practice tables persist in the server database, never record results or run probability
jobs, and cannot be joined or controlled by another visitor. Ordinary multiplayer games
retain their normal permissions; the local development singleton remains separate.
