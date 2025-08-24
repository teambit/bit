import humanizeDuration from 'humanize-duration';

export function timeFormat(time: number): string {
  const duration = humanizeDuration(Number(time), {
    round: true,
    units: ['y', 'mo', 'w', 'd', 'h', 'm', 's', 'ms'],
  });
  return duration.replace(/millisecond(s)?/, 'ms');
}