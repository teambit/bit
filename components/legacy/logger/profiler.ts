/**
 * the profilers map lives as long as the process does, which for a daemon (`bit cli`) is forever.
 * callers are free to profile with a dynamically generated id (e.g. `getMany-${callId}`), so without
 * a cap the map would keep growing for the entire lifetime of the process.
 * the cap is only there to turn an unbounded growth into a bounded one, so it's kept well above what
 * a real profiling session needs - a large workspace profiled per component (a few profile points on
 * each of a few thousand components) stays far below it. an entry costs ~250 bytes, so the worst
 * case is a couple of MB.
 */
export const MAX_PROFILERS = 10000;

/**
 * the number of the oldest profilers to look at when searching for one to evict. keeps the eviction
 * O(1) even when the oldest profilers are all still being measured.
 */
const EVICTION_SCAN_LIMIT = 50;

export class Profiler {
  private profilers = new Map<string, { current?: number; total?: number }>();

  /**
   * the number of profilers currently retained. never exceeds `MAX_PROFILERS`.
   */
  get size(): number {
    return this.profilers.size;
  }

  profile(id: string): string {
    const existingProfiler = this.profilers.get(id);
    const now = Date.now();
    if (existingProfiler?.current) {
      const sinceLastCall = now - existingProfiler.current;
      const total = existingProfiler.total ? existingProfiler.total + sinceLastCall : sinceLastCall;
      existingProfiler.total = total;
      delete existingProfiler.current;
      return `${sinceLastCall}ms. (total repeating ${total}ms)`;
    }
    if (existingProfiler) {
      existingProfiler.current = now;
      return '';
    }
    this.evictIfNeeded();
    this.profilers.set(id, { current: now });
    return '';
  }

  /**
   * forget all the measurements. the caller decides whether a measurement that is still open can
   * still produce a meaningful result - see the callers of `switchTo` in the logger.
   */
  reset() {
    this.profilers.clear();
  }

  /**
   * make room for a new profiler by dropping the oldest one. prefer a completed profiler - it's kept
   * around only for the "total repeating" data, whereas one with `current` is still being measured.
   * (a profiler whose closing call never came - an early return or a throw in between - is left with
   * `current` set forever, so eventually those get evicted as well.)
   */
  private evictIfNeeded() {
    if (this.profilers.size < MAX_PROFILERS) return;
    let oldestId: string | undefined;
    let scanned = 0;
    for (const [id, profiler] of this.profilers) {
      if (oldestId === undefined) oldestId = id;
      if (!profiler.current) {
        this.profilers.delete(id);
        return;
      }
      scanned += 1;
      if (scanned >= EVICTION_SCAN_LIMIT) break;
    }
    if (oldestId !== undefined) this.profilers.delete(oldestId);
  }
}
