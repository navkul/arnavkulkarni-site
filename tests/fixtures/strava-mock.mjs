import { MockAgent, setGlobalDispatcher } from 'undici';

const agent = new MockAgent();
// Allow build dependencies (e.g. Google Fonts), but never fall through to live Strava.
agent.disableNetConnect();
agent.enableNetConnect((host) => !/^www\.strava\.com(?::|$)/.test(host));
setGlobalDispatcher(agent);
const strava = agent.get('https://www.strava.com');
const json = { headers: { 'content-type': 'application/json' } };

const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const run = {
  id: 9000001,
  name: 'Morning Run',
  sport_type: 'Run',
  distance: 8046.72,
  moving_time: 2400,
  elapsed_time: 2460,
  total_elevation_gain: 30.48,
  start_date: recentDate,
  start_date_local: recentDate,
  description: 'Synthetic easy run for CI.',
};

strava
  .intercept({ path: '/api/v3/athlete/activities?per_page=50', method: 'GET' })
  .reply(
    process.env.E2E_STRAVA_MODE === 'unavailable' ? 503 : 200,
    process.env.E2E_STRAVA_MODE === 'unavailable' ? { message: 'Service Unavailable' } : [run],
    json,
  )
  .persist();

const races = [
  { id: 18158203606, name: 'Newport Half' },
  { id: 16676946767, name: 'Gloucester Half' },
].map((race) => ({
  ...run,
  ...race,
  distance: 21097.5,
  moving_time: 5700,
  elapsed_time: 5760,
  start_date: '2025-01-01T12:00:00Z',
  start_date_local: '2025-01-01T12:00:00Z',
}));

for (const activity of [run, ...races]) {
  strava
    .intercept({ path: `/api/v3/activities/${activity.id}`, method: 'GET' })
    .reply(200, activity, json)
    .persist();
}

for (const race of races) {
  strava
    .intercept({ path: new RegExp(`^/api/v3/activities/${race.id}/streams\\?`), method: 'GET' })
    .reply(
      200,
      {
        latlng: {
          data: [
            [42.36, -71.06],
            [42.365, -71.055],
            [42.37, -71.06],
            [42.36, -71.06],
          ],
        },
        distance: { data: [0, 7000, 14000, 21097.5] },
        altitude: { data: [5, 15, 10, 5] },
        velocity_smooth: { data: [3, 3.5, 4, 3.2] },
        moving: { data: [true, true, true, true] },
      },
      json,
    )
    .persist();
}
