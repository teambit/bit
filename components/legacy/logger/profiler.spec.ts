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

  describe('bounding the retained profilers', () => {
    it('does not grow indefinitely when the ids are generated dynamically', () => {
      const profiler = new Profiler();
      for (let i = 0; i < MAX_PROFILERS * 2; i += 1) {
        profiler.profile(`some-id-${i}`);
        profiler.profile(`some-id-${i}`);
      }
      expect(profiler.size).to.equal(MAX_PROFILERS);
    });

    it('evicts completed profilers before ones still being measured', () => {
      const profiler = new Profiler();
      profiler.profile('long-running'); // opened first, closed last.
      for (let i = 0; i < MAX_PROFILERS * 2; i += 1) {
        profiler.profile(`some-id-${i}`);
        profiler.profile(`some-id-${i}`);
      }
      // had it been evicted, this would have been treated as an opening call and return ''.
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

  describe('reset', () => {
    it('forgets the open measurements, so a later call does not close a stale one', () => {
      const profiler = new Profiler();
      profiler.profile('some-id');
      profiler.reset();
      expect(profiler.size).to.equal(0);
      // treated as an opening call rather than as closing the measurement dropped by the reset.
      expect(profiler.profile('some-id')).to.equal('');
    });
  });
});
