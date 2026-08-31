import { expect } from 'chai';
import { MAX_PROFILERS, Profiler } from './profiler';

/**
 * the message format is `${sinceLastCall}ms. (total repeating ${total}ms)`
 */
function parseMsg(msg: string): { sinceLastCall: number; total: number } {
  const match = msg.match(/^(\d+)ms\. \(total repeating (\d+)ms\)$/);
  if (!match) throw new Error(`unexpected profiler message: "${msg}"`);
  return { sinceLastCall: Number(match[1]), total: Number(match[2]) };
}

describe('Profiler', () => {
  describe('measuring', () => {
    it('returns an empty string on the opening call and a message on the closing call', () => {
      const profiler = new Profiler();
      expect(profiler.profile('some-id')).to.equal('');
      expect(parseMsg(profiler.profile('some-id')).sinceLastCall).to.be.at.least(0);
    });

    it('accumulates the total across repeating calls', () => {
      const profiler = new Profiler();
      profiler.profile('some-id');
      const first = parseMsg(profiler.profile('some-id'));
      profiler.profile('some-id');
      const second = parseMsg(profiler.profile('some-id'));
      expect(second.total).to.equal(first.total + second.sinceLastCall);
    });

    it('keeps measurements of different ids separated', () => {
      const profiler = new Profiler();
      profiler.profile('a');
      profiler.profile('b');
      expect(profiler.profile('b')).to.not.equal('');
      expect(profiler.profile('a')).to.not.equal('');
    });
  });

  describe('bounding the retained measurements', () => {
    it('does not grow indefinitely when the ids are generated dynamically', () => {
      const profiler = new Profiler();
      for (let i = 0; i < MAX_PROFILERS * 2; i += 1) {
        profiler.profile(`some-id-${i}`);
        profiler.profile(`some-id-${i}`);
      }
      expect(profiler.size).to.equal(MAX_PROFILERS);
    });

    it('does not grow indefinitely when the closing calls never come', () => {
      const profiler = new Profiler();
      for (let i = 0; i < MAX_PROFILERS * 2; i += 1) {
        profiler.profile(`some-id-${i}`); // opened and abandoned.
      }
      expect(profiler.size).to.equal(MAX_PROFILERS);
    });

    it('never drops a measurement that is still running to make room for a completed one', () => {
      const profiler = new Profiler();
      profiler.profile('long-running'); // opened first, closed last.
      for (let i = 0; i < MAX_PROFILERS * 2; i += 1) {
        profiler.profile(`some-id-${i}`);
        profiler.profile(`some-id-${i}`);
      }
      // had it been dropped, this would have been treated as an opening call and return ''.
      expect(profiler.profile('long-running')).to.not.equal('');
    });

    it('keeps a real per-component profiling session well below the cap', () => {
      const profiler = new Profiler();
      const components = 300;
      const profilePointsPerComponent = 5;
      for (let component = 0; component < components; component += 1) {
        for (let point = 0; point < profilePointsPerComponent; point += 1) {
          profiler.profile(`scope/component-${component}:point-${point}`);
          profiler.profile(`scope/component-${component}:point-${point}`);
        }
      }
      expect(profiler.size)
        .to.equal(components * profilePointsPerComponent)
        .and.to.be.below(MAX_PROFILERS);
    });
  });

  describe('discard', () => {
    it('forgets a running measurement, so a later call does not close it', () => {
      const profiler = new Profiler();
      profiler.profile('some-id');
      profiler.discard('some-id');
      expect(profiler.size).to.equal(0);
      // treated as an opening call rather than as closing the discarded measurement.
      expect(profiler.profile('some-id')).to.equal('');
    });

    it('leaves the measurements of the other ids alone', () => {
      const profiler = new Profiler();
      profiler.profile('a');
      profiler.profile('b');
      profiler.discard('a');
      expect(profiler.profile('b')).to.not.equal('');
    });
  });
});
