/** Test controls are never enabled in a production build or on Vercel. */
export function testingAvailable() {
  return process.env.NODE_ENV === 'development' && !process.env.VERCEL;
}
