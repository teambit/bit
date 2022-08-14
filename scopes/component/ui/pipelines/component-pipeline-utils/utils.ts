export function calcDuration(startTime?: number, endTime?: number): number {
  return (endTime || 0) - (startTime || 0);
}

export function calcSeconds(duration: number): number {
  return Math.floor(duration / 1000);
}

export function calcMilliseconds(duration: number): number {
  return duration % 1000;
}
