import { expect } from 'chai';
import { LANE_HEAD_TRAILER, SYNC_COMMIT_MARKER, buildSyncCommitMessage, hasSyncMarker } from './sync-state';

/**
 * Under the v2 (bit-native) state model the sync commit's message is an **annotation**: a human audit trail
 * plus the `[bit-sync]` marker the action repo's event router matches. Nothing in the reconciler parses it
 * back as state — that comes from `.bitmap` (see `bitmap-state.ts`). These specs therefore lock what the
 * message must *carry*, and the one thing still read from a message: the marker.
 */
describe('buildSyncCommitMessage', () => {
  it('names the lane in the subject and carries both annotations', () => {
    const msg = buildSyncCommitMessage('acme.shop/my-lane', 'a'.repeat(40));
    expect(msg.split('\n', 1)[0]).to.equal(`chore(bit-sync): sync lane acme.shop/my-lane @ ${'a'.repeat(9)}`);
    expect(msg).to.include(`${LANE_HEAD_TRAILER}: ${'a'.repeat(40)}`);
    expect(msg).to.include(SYNC_COMMIT_MARKER);
  });

  it('scope-qualifies the lane id, so an audit trail names the lane that actually exists', () => {
    // The reconciler addresses bit by the lane's REAL id (`hostScope/name`), which is not necessarily
    // `<defaultScope>/name`. A human reading `git log` has to see the same id `bit lane show` would take.
    expect(buildSyncCommitMessage('other.scope/my-lane', 'b'.repeat(40))).to.include('sync lane other.scope/my-lane');
  });
});

/**
 * The one thing still read out of a commit message, and it is not state:
 *
 * - `bit ci sync` prints a hint when the branch tip is one of its own commits;
 * - `lastNonSyncCommitMessage` skips them when picking the snap message for an export;
 * - the `bit-git-sync` action's event router matches the same literal to avoid re-triggering on our push.
 *
 * All three are heuristics whose worst failure is a redundant run — none of them can retire a branch or
 * decide which side of a pair is newer.
 */
describe('hasSyncMarker as loop guard', () => {
  it('recognizes both sync commit shapes', () => {
    expect(hasSyncMarker(buildSyncCommitMessage('acme.shop/my-lane', 'c'.repeat(40)))).to.equal(true);
    expect(hasSyncMarker('chore(bit-sync): sync git to latest main scope versions\n\n[bit-sync]')).to.equal(true);
  });

  it('recognizes a marker that is part of the subject line, not only a trailer block', () => {
    // `executeMergeDiverged`'s snap message puts the marker inline; the action repo's event router
    // matches the same literal, so any position has to count.
    expect(hasSyncMarker('merge remote lane acme.shop/my-lane into my-lane [bit-sync]')).to.equal(true);
  });

  it('does not recognize an ordinary commit', () => {
    expect(hasSyncMarker('feat: something')).to.equal(false);
  });
});
