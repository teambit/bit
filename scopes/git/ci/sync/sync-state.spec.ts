import { expect } from 'chai';
import {
  LANE_HEAD_TRAILER,
  SYNC_COMMIT_MARKER,
  buildSyncCommitMessage,
  hasSyncMarker,
  isSyncAuthoredMessage,
} from './sync-state';

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

/**
 * The STRICT probe, and the only message-derived input to a branch deletion.
 *
 * `hasSyncMarker` is a bare substring match, which is right for the loop guard (a false positive costs one
 * skipped run) and wrong here (a false positive costs a developer's branch). The deletion conjunction exists
 * to stop a developer's own `.bitmap`-touching commit from reading as ours; if merely *quoting* the marker
 * satisfied it, the laundering shape would walk straight back in through the commit message.
 */
describe('isSyncAuthoredMessage as the deletion gate', () => {
  it('accepts what buildSyncCommitMessage actually produces', () => {
    expect(isSyncAuthoredMessage(buildSyncCommitMessage('acme.shop/my-lane', 'a'.repeat(40)))).to.equal(true);
  });

  it('accepts the raw `git log %B` shape, trailing newline and all', () => {
    expect(isSyncAuthoredMessage(`${buildSyncCommitMessage('acme.shop/my-lane', 'b'.repeat(40))}\n`)).to.equal(true);
  });

  it('accepts the main-scope sync commit, whose marker is also its own line', () => {
    expect(isSyncAuthoredMessage('chore(bit-sync): sync git to latest main scope versions\n\n[bit-sync]')).to.equal(
      true
    );
  });

  it('REJECTS a message that merely quotes the marker mid-line — the laundering hole', () => {
    // A developer reverting sync churn writes exactly this, and `bit revert`-style commits touch `.bitmap`.
    // Under a substring match this commit would claim authorship and license deleting the branch.
    const quoted = 'revert the [bit-sync] bitmap churn';
    expect(hasSyncMarker(quoted), 'the loop guard is deliberately permissive here').to.equal(true);
    expect(isSyncAuthoredMessage(quoted)).to.equal(false);
  });

  it('REJECTS the marker quoted on its own line but with text around it', () => {
    expect(isSyncAuthoredMessage('fix: undo\n\nthis reverts a [bit-sync] commit\n')).to.equal(false);
    expect(isSyncAuthoredMessage('chore: mention [bit-sync] here')).to.equal(false);
  });

  it('REJECTS the inline-marker snap message, which is a LANE message and never a branch tip', () => {
    // `executeMergeDiverged` puts the marker inline in the snap message it sends to bit. The git commit that
    // run pushes is `buildSyncCommitMessage`'s, so no branch tip ever legitimately has this shape.
    expect(isSyncAuthoredMessage('merge remote lane acme.shop/my-lane into my-lane [bit-sync]')).to.equal(false);
  });

  it('tolerates CRLF line endings', () => {
    expect(isSyncAuthoredMessage(`subject\r\n\r\n${SYNC_COMMIT_MARKER}\r\n`)).to.equal(true);
  });

  it('rejects an ordinary commit', () => {
    expect(isSyncAuthoredMessage('feat: something')).to.equal(false);
    expect(isSyncAuthoredMessage(`${LANE_HEAD_TRAILER}: ${'c'.repeat(40)}`)).to.equal(false);
  });
});
