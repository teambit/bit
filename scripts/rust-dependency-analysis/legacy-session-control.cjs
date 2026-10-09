// Benchmark control using the SAME detector dispatch as compare.cjs, at the actual batch boundary.
// Never used by ordinary commands. Logical paths remain distinct, including symlink spellings.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { legacy } = require('./compare.cjs');
class LegacySessionControl {
  constructor(metrics) {
    this.metrics = metrics;
    this.cache = new Map();
    this.bytes = 0;
  }
  remember(key, source, result) {
    const bytes = Buffer.byteLength(source) + Buffer.byteLength(JSON.stringify(result));
    if (bytes > 4 * 1024 * 1024) return result;
    if (this.bytes + bytes > 64 * 1024 * 1024) this.clearCache();
    this.cache.set(key, result);
    this.bytes += bytes;
    return result;
  }
  extract(filename, source) {
    this.metrics.controlParses++;
    const outcome = legacy({ path: filename, source });
    return {
      path: filename,
      dependencies: outcome.dependencies || {},
      diagnostics: outcome.diagnostic ? [outcome.diagnostic] : [],
      status: outcome.status,
    };
  }
  async prefetch(filenames) {
    // Serial bounded frontier consumption retains one extraction per unique eligible path.
    for (const input of filenames) {
      const filename = path.resolve(input);
      if (this.cache.has(filename)) {
        this.metrics.controlCacheHits++;
        continue;
      }
      let source;
      try {
        source = fs.readFileSync(filename, 'utf8');
      } catch (error) {
        this.cache.set(filename, {
          path: filename,
          status: 'read_error',
          dependencies: {},
          diagnostics: [error.message],
        });
        continue;
      }
      this.metrics.controlReads++;
      this.remember(filename, source, this.extract(filename, source));
    }
  }
  get(filename) {
    return this.cache.get(path.resolve(filename));
  }
  async scanSource(filename, source) {
    const key = `${path.resolve(filename)}\0${createHash('sha256').update(source).digest('hex')}`;
    if (this.cache.has(key)) {
      this.metrics.controlCacheHits++;
      return this.cache.get(key);
    }
    return this.remember(key, source, this.extract(filename, source));
  }
  clearCache() {
    this.cache.clear();
    this.bytes = 0;
  }
  dispose() {
    this.clearCache();
  }
}
exports.LegacySessionControl = LegacySessionControl;
