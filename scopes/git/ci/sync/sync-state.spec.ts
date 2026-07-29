import { expect } from 'chai';
import {
  parseLaneHeadTrailer,
  parseSyncCommitLaneId,
  buildSyncCommitMessage,
  isSyncCommitMessage,
  hasSyncMarker,
} from './sync-state';

describe('sync-state', () => {
  it('builds a message that round-trips through the parser', () => {
    const msg = buildSyncCommitMessage('acme.shop/my-lane', 'abc123def456');
    expect(parseLaneHeadTrailer(msg)).to.equal('abc123def456');
    expect(isSyncCommitMessage(msg)).to.equal(true);
    expect(msg).to.contain('acme.shop/my-lane');
  });

  it('returns undefined for messages without the trailer', () => {
    expect(parseLaneHeadTrailer('feat: normal commit')).to.equal(undefined);
    expect(isSyncCommitMessage('feat: normal commit')).to.equal(false);
  });

  it('parses the trailer from a multi-line message body', () => {
    const msg = 'chore(bit-sync): update\n\nsome body\n\nBit-Lane-Head: deadbeef01\n[bit-sync]';
    expect(parseLaneHeadTrailer(msg)).to.equal('deadbeef01');
  });

  /**
   * `readBranchSyncState` finds candidate commits with `git log --grep=Bit-Lane-Head:`, which matches the
   * string *anywhere* in a message, and then keeps only those the parser accepts. This is that filter:
   * a developer quoting a previous sync commit mid-line must not be mistaken for one, otherwise it would
   * mask the real sync commit behind it and the branch would read as never-synced.
   */
  it('only accepts the trailer at the start of a line, so a mid-line mention is not a sync commit', () => {
    const quoted = 'fix: undo the bad sync\n\nreverts the commit whose Bit-Lane-Head: abc123 was wrong\n';
    expect(parseLaneHeadTrailer(quoted)).to.equal(undefined);
    expect(isSyncCommitMessage(`${quoted}[bit-sync]`)).to.equal(false);
  });

  it('parses the trailer out of a raw `git log %B` body, trailing newline and all', () => {
    // The exact shape `readBranchSyncState` hands the parser: `%B` keeps the blank line before the
    // trailer block and the newline after it.
    const rawBody = `${buildSyncCommitMessage('acme.shop/my-lane', 'f'.repeat(40))}\n`;
    expect(parseLaneHeadTrailer(rawBody)).to.equal('f'.repeat(40));
  });
});

/**
 * The attribution half of the branch-ownership check. A `Bit-Lane-Head` trailer says "some sync commit";
 * only the subject says *which pair* it was written for — and that distinction is the whole defence against
 * deleting a developer branch that merely inherited a trailer from the default branch.
 */
describe('parseSyncCommitLaneId', () => {
  it('recovers the lane id from a message buildSyncCommitMessage produced', () => {
    const msg = buildSyncCommitMessage('acme.shop/my-lane', 'a'.repeat(40));
    expect(parseSyncCommitLaneId(msg)).to.equal('acme.shop/my-lane');
  });

  it('survives the raw `git log %B` shape, trailing newline included', () => {
    const rawBody = `${buildSyncCommitMessage('acme.shop/my-lane', 'b'.repeat(40))}\n`;
    expect(parseSyncCommitLaneId(rawBody)).to.equal('acme.shop/my-lane');
  });

  it('distinguishes one lane from another, which is the point', () => {
    const ours = buildSyncCommitMessage('acme.shop/my-lane', 'c'.repeat(40));
    const theirs = buildSyncCommitMessage('acme.shop/other-lane', 'c'.repeat(40));
    expect(parseSyncCommitLaneId(ours)).to.not.equal(parseSyncCommitLaneId(theirs));
  });

  it('returns undefined for a commit that carries a trailer but not our subject', () => {
    // e.g. a hand-written commit, or a squash commit whose subject the git host rewrote to the PR title.
    // Unattributable is treated exactly like "not ours" — the branch is left alone.
    const squashed = 'Lane sync: acme.shop/my-lane (#42)\n\nBit-Lane-Head: deadbeef\n[bit-sync]';
    expect(parseSyncCommitLaneId(squashed)).to.equal(undefined);
    expect(parseLaneHeadTrailer(squashed)).to.equal('deadbeef');
  });

  it('returns undefined for an ordinary commit', () => {
    expect(parseSyncCommitLaneId('feat: add a thing')).to.equal(undefined);
  });
});

describe('hasSyncMarker as loop guard', () => {
  it('recognizes main-sync commits (marker without trailer) via marker-only helper', () => {
    expect(hasSyncMarker('chore(bit-sync): sync git to latest main scope versions\n\n[bit-sync]')).to.equal(true);
    expect(hasSyncMarker('feat: something')).to.equal(false);
  });

  it('recognizes a marker that is part of the subject line, not only a trailer block', () => {
    // `executeMergeDiverged`'s snap message puts the marker inline; the action repo's event router
    // matches the same literal, so any position has to count.
    expect(hasSyncMarker('merge remote lane acme.shop/my-lane into my-lane [bit-sync]')).to.equal(true);
  });
});
