# Arnav Kulkarni's site

Next.js 16 site deployed through Vercel. Use Node 22 (`nvm use`) and install the
locked dependencies with `npm ci`.

## Development and checks

Race maps require a free [CARTO Basemaps API key](https://carto.com/basemaps/apikey/).
Set `NEXT_PUBLIC_CARTO_BASEMAP_API_KEY` in `.env.local` for local development and
in the Vercel project's environment variables before building. Next.js embeds
this browser-visible key at build time, so changing it requires a new deployment.
Restrict the key to the site's domains and any local or preview hosts you use.
CARTO and OpenStreetMap attribution must remain visible on both maps.

```sh
nvm use
npm ci
npm run dev
```

Before opening a pull request:

```sh
npm run format        # Apply formatting locally
npm run format:check  # CI checks formatting without editing files
npm run lint
npm run typecheck
npx playwright install chromium
npm run test:e2e
npm run test:e2e:unavailable
```

The two browser commands each run a fresh production build, start it on
`127.0.0.1:3100`, and stop it when tests finish. Don't run them concurrently or
while another Next.js process is using this project's `.next` directory.
On Linux, use `npx playwright install --with-deps chromium` to install the browser
and its system dependencies.

Tests cover desktop and mobile layouts, published Markdown pages, draft and
unknown-page 404s, client navigation, running stats, map rendering/zoom, browser
errors, and the Strava outage fallback. They intercept server-side Strava HTTP
requests with synthetic data and replace browser map tiles with a local image.
No Strava credentials or live Strava/tile-CDN access are needed. Google Fonts
still requires network access during the build. These tests don't verify live
Strava authentication or the external tile service's availability.

The HTTP mock is loaded only by `tests/start-server.mjs`; application code and
normal `npm run build` deployments never load it. Tests replace the local `.next`
output with their synthetic build. Run `npm run build` again before serving a
normal local production build, and never deploy the test build as a prebuilt
artifact.

Failure screenshots and traces are saved under `test-results/`; HTML reports are
saved under `playwright-report/`, with separate directories for each scenario.

## TypeScript toolchain

`npm run typecheck` uses TypeScript 7.0.2 through the
`@typescript/native` npm alias, which supplies `tsc`. The `typescript` dependency
aliases `@typescript/typescript6` so ESLint and editor plugins can still use the
TypeScript 6 JavaScript API. Next.js also resolves this compatibility package
for its built-in build type check. Keep both aliases: TypeScript 7.0 does not provide
that API. This follows [Microsoft's side-by-side setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0).

## Continuous integration and deployment gates

`.github/workflows/ci.yml` runs on PRs targeting `main`, pushes to `main` (including
merges), merge-queue events, and manual dispatches. It exposes two stable checks:

- `quality`: formatting, ESLint with zero warnings, and generated Next.js route
  types plus TypeScript checking.
- `build-and-smoke`: production builds and Playwright tests for both normal
  Strava responses and an outage, using desktop and mobile Chromium.

The jobs run independently on Node 22 with `npm ci` and npm download caching.
They use read-only GitHub permissions and no repository secrets. Action versions
are pinned to commit SHAs. New PR commits cancel obsolete PR runs; production
branch runs are not cancelled mid-run. Failed browser runs upload diagnostic
artifacts for seven days.

Require both checks in the GitHub ruleset for `main`, with PRs and up-to-date
branches required. Zero required approvals allows the owner of this personal
site to merge their own PR once checks pass. Block force pushes and branch
deletion, and don't configure an administrator bypass.
The intended rule configuration is recorded in `.github/main-ruleset.json`;
committing that file alone does not apply it to GitHub.

In **Vercel → Project Settings → Deployment Checks → Add Checks → GitHub**, select
both `quality` and `build-and-smoke`. Keep the Git integration and automatic
production aliasing enabled. Vercel may build concurrently, but must wait for
both checks on the production commit before assigning the deployment to the live
domain. GitHub checks alone do **not** make Vercel wait.

These account settings are separate from the workflow file; verify both gates
before merging the initial CI PR. See [Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).
