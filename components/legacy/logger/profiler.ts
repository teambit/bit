export class Profiler {
  profilers: { [id: string]: { current?: number; total?: number } } = {};
  profile(id: string): string {
    if (!this.profilers[id]) this.profilers[id] = {};
    const currentProfiler = this.profilers[id];
    const now = Date.now();
    if (currentProfiler.current) {
      const sinceLastCall = now - currentProfiler.current;
      const total = currentProfiler.total ? currentProfiler.total + sinceLastCall : sinceLastCall;
      currentProfiler.total = total;
      delete currentProfiler.current;
      return `${sinceLastCall}ms. (total repeating ${total}ms)`;
    }
    currentProfiler.current = now;
    return '';
  }
}
