import humanizeDuration from 'humanize-duration';

export function timeFormat(time: number) {
  if (time < 1000) {
    return humanizeDuration(time, { units: ['ms'] });
  }
  return humanizeDuration(time);
}
