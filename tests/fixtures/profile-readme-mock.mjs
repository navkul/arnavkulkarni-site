import { MockAgent, setGlobalDispatcher } from 'undici';

const agent = new MockAgent();
agent.disableNetConnect();
// Never request the live README or Strava in tests.
agent.enableNetConnect(
  (host) => !/^(raw\.githubusercontent\.com|www\.strava\.com)(?::|$)/.test(host),
);
setGlobalDispatcher(agent);

const markdown = `[@CASP Systems Lab](https://sites.bu.edu/casp/) Scalable & efficient stream processing systems

[@Grepr](https://www.grepr.ai/) Real-time ML systems - Prev 2x. SWE intern

CS, Economics - Boston University

Synced README fixture.`;
const unavailable = process.env.E2E_README_MODE === 'unavailable';
agent
  .get('https://raw.githubusercontent.com')
  .intercept({ path: '/navkul/navkul/main/README.md', method: 'GET' })
  .reply(unavailable ? 503 : 200, unavailable ? 'Unavailable' : markdown, {
    headers: { 'content-type': 'text/plain' },
  })
  .persist();
