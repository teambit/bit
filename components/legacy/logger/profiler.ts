/**
 * the profilers map lives as long as the process does, which for a daemon (`bit cli`) is forever.
 * callers are free to profile with a dynamically generated id (e.g. `getMany-${callId}`), so without
 * a cap the map would keep growing for the entire lifetime of the process.
 */
export const MAX_PROFILERS = 500;

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
   * make room for a new profiler by dropping the oldest one. prefer a completed profiler - it's kept
   * around only for the "total repeating" data, whereas one with `current` is still being measured.
   * (a profiler whose closing call never came - an early return or a throw in between - is left with
   * `current` set forever, so eventually those get evicted as well.)
   */
  private evictIfNeeded() {
    if (this.profilers.size < MAX_PROFILERS) return;
    for (const [id, profiler] of this.profilers) {
      if (!profiler.current) {
        this.profilers.delete(id);
        return;
      }
    }
    const oldestId = this.profilers.keys().next().value;
    if (oldestId !== undefined) this.profilers.delete(oldestId);
  }
}
