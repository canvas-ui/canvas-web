// Frame rates shared by the Lens surfaces (LensTab feeds + LensApplet camera).
// The tick loops are chained timeouts that schedule the NEXT frame only after
// the current search returns, so even 30 fps can never stack requests — when
// the server is slower than the interval the loop simply degrades to
// one-request-in-flight. 30 fps is an experiment: expect it to be limited by
// embed latency, not the timer.
export const LENS_RATES = [
  { label: '0.5 fps', ms: 2000 },
  { label: '1 fps', ms: 1000 },
  { label: '2 fps', ms: 500 },
  { label: '5 fps', ms: 200 },
  { label: '10 fps', ms: 100 },
  { label: '15 fps', ms: 67 },
  { label: '30 fps', ms: 33 },
] as const

export const DEFAULT_LENS_RATE_MS = 1000
