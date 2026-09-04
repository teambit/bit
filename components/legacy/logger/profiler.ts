/**
 * the profiler maps live as long as the process does, which for a daemon (`bit cli`) is forever.
 * callers are free to profile with a dynamically generated id (e.g. `getMany-${callId}`), so without
 * a cap they would keep growing for the entire lifetime of the process.
 * the cap is only there to turn an unbounded growth into a bounded one, so it's kept well above what
 * a real profiling session needs - a large workspace profiled per component (a few profile points on
 * each of a few thousand components) stays far below it. an entry costs ~250 bytes, so the worst
 * case is a couple of MB. it applies to each of the two maps below separately.
 */
export const MAX_PROFILERS = 10000;

type OpenProfiler = { start: number; total: number };

export class Profiler {
  /**
   * measurements that got their opening call and wait for the closing one. they're kept apart from
   * the completed ones so that making room for a new measurement never drops a measurement that is
   * still running.
   */
  private open = new Map<string, OpenProfiler>();
  /**
   * the total time of the measurements that completed, per id. kept only to be able to show the
   * "total repeating" of an id that gets profiled more than once.
   */
  private completedTotals = new Map<string, number>();

  /**
   * the number of the retained measurements.
   */
  get size(): number {
    return this.open.size + this.completedTotals.size;
  }

  profile(id: string): string {
    const openProfiler = this.open.get(id);
    const now = Date.now();
    if (openProfiler) {
      const sinceLastCall = now - openProfiler.start;
      const total = openProfiler.total + sinceLastCall;
      this.open.delete(id);
      this.setBounded(this.completedTotals, id, total);
      return `${sinceLastCall}ms. (total repeating ${total}ms)`;
    }
    const totalSoFar = this.completedTotals.get(id) || 0;
    this.completedTotals.delete(id);
    this.setBounded(this.open, id, { start: now, total: totalSoFar });
    return '';
  }

  /**
   * forget a measurement that waits for its closing call, when that call is known to never come.
   * without it, a later call with the same id closes this measurement and reports the time of
   * everything that happened in between.
   */
  discard(id: string) {
    this.open.delete(id);
  }

  /**
   * add an entry to a bounded map, dropping the oldest one to make room. a `Map` keeps the insertion
   * order, thus the first key it gives is the oldest.
   */
  private setBounded<T>(map: Map<string, T>, id: string, value: T) {
    if (map.size >= MAX_PROFILERS) {
      const oldestId = map.keys().next().value;
      if (oldestId !== undefined) map.delete(oldestId);
    }
    map.set(id, value);
  }
}
