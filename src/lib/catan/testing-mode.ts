/** The local singleton test table remains development-only. */
export function testingAvailable() {
  return process.env.NODE_ENV === 'development' && !process.env.VERCEL;
}

/** Production controls are restricted to explicitly created, unranked practice rooms. */
export function testControlsAvailable(room: {
  testing?: boolean;
  practice?: boolean;
  hosting?: 'server' | 'local';
}) {
  return (
    !!room.testing &&
    ((room.practice === true && room.hosting === 'server') ||
      (testingAvailable() && room.hosting === 'local'))
  );
}
