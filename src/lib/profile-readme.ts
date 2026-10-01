import 'server-only';

import { remark } from 'remark';
import html from 'remark-html';

const README_URL = 'https://raw.githubusercontent.com/navkul/navkul/main/README.md';
const FALLBACK_README = `[@Boston University](https://www.youtube.com/watch?v=dQw4w9WgXcQ) CS, Economics

[@CASP Systems Lab](https://sites.bu.edu/casp/) Scalable & efficient stream processing systems

[@Grepr](https://www.grepr.ai/) Real-time ML systems - Prev 2x. SWE intern

[@Catan](https://arnavkulkarni.com/catan) Considering going pro

In my free time, I'm running/lifting or playing/watching soccer - Arsenal fan, unfortunately`;

export async function getProfileReadmeHtml(): Promise<string> {
  let markdown = FALLBACK_README;

  try {
    const response = await fetch(README_URL, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`GitHub README returned ${response.status}`);
    const readme = await response.text();
    if (!readme.trim()) throw new Error('GitHub README was empty');
    markdown = readme;
  } catch {
    console.warn('GitHub profile README unavailable; using the fallback intro.');
  }

  // Sanitize remote Markdown before inserting its rendered HTML into the page.
  return (await remark().use(html, { sanitize: true }).process(markdown)).toString();
}
