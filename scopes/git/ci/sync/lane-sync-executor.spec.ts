import { expect } from 'chai';
import { isProtectedBranch, laneHeadFingerprint } from './lane-sync-executor';

type LaneComponents = Parameters<typeof laneHeadFingerprint>[0];

/**
 * A stand-in for `LaneData`'s component entry. `laneHeadFingerprint` only ever reads
 * `id.toStringWithoutVersion()` and `head`, so the test doesn't need a real `ComponentID` — and not
 * building one keeps this spec independent of the workspace/scope machinery.
 */
function comp(id: string, head: string): LaneComponents[number] {
  return { id: { toStringWithoutVersion: () => id }, head } as unknown as LaneComponents[number];
}

describe('laneHeadFingerprint', () => {
  const a = comp('acme.shop/comp1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
  const b = comp('acme.shop/comp2', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2');

  it('is a single 40-hex token, so it survives a round-trip through a commit trailer', () => {
    // `parseLaneHeadTrailer` reads the value with `(\S+)`: a multi-line or space-containing value would
    // be silently truncated to its first token, and every later run would compare against the truncation.
    const fingerprint = laneHeadFingerprint([a, b]);
    expect(fingerprint).to.match(/^[0-9a-f]{40}$/);
  });

  it('is stable under reordering: the remote listing order must not look like the lane moved', () => {
    expect(laneHeadFingerprint([a, b])).to.equal(laneHeadFingerprint([b, a]));
  });

  it('changes when a component head changes', () => {
    const moved = comp('acme.shop/comp2', 'cccccccccccccccccccccccccccccccccccccc33');
    expect(laneHeadFingerprint([a, moved])).to.not.equal(laneHeadFingerprint([a, b]));
  });

  it('changes when a component is added or removed', () => {
    expect(laneHeadFingerprint([a])).to.not.equal(laneHeadFingerprint([a, b]));
    expect(laneHeadFingerprint([])).to.not.equal(laneHeadFingerprint([a]));
  });

  it('does not depend on the lane object, only on its content', () => {
    // Two different lanes holding the same component heads fingerprint identically. That is the point:
    // `LaneData.hash` is minted randomly at creation time and never moves when the lane advances, so it
    // cannot answer "did this lane change since the last sync?".
    expect(laneHeadFingerprint([a, b])).to.equal(laneHeadFingerprint([comp('acme.shop/comp1', a.head), b]));
  });
});

/**
 * The last-resort guard at `executeClosePr`'s `git push origin --delete` site. The planner can never
 * route the default branch or the main sync branch to `close-pr` (neither is treated as lane-mapped), so
 * these rows lock the belt-and-braces refusal that must hold even when everything upstream is wrong.
 */
describe('isProtectedBranch', () => {
  it('refuses the default branch and the main sync branch', () => {
    expect(isProtectedBranch('develop', 'develop', 'bit-sync/main')).to.equal(true);
    expect(isProtectedBranch('bit-sync/main', 'develop', 'bit-sync/main')).to.equal(true);
  });

  it('permits an ordinary lane branch', () => {
    expect(isProtectedBranch('my-lane', 'develop', 'bit-sync/main')).to.equal(false);
  });
});
