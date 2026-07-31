import { expect } from 'chai';
import {
  LANE_HEAD_TRAILER,
  SYNC_COMMIT_MARKER,
  buildSyncCommitMessage,
  hasSyncMarker,
  isSyncAuthoredMessage,
} from './sync-state';

describe('buildSyncCommitMessage', () => {
  it('names the lane in the subject and carries both annotations', () => {
    const msg = buildSyncCommitMessage('acme.shop/my-lane', 'a'.repeat(40));
    expect(msg.split('\n', 1)[0]).to.equal(`chore(bit-sync): sync lane acme.shop/my-lane @ ${'a'.repeat(9)}`);
    expect(msg).to.include(`${LANE_HEAD_TRAILER}: ${'a'.repeat(40)}`);
    expect(msg).to.include(SYNC_COMMIT_MARKER);
  });

  it('scope-qualifies the lane id, so an audit trail names the lane that actually exists', () => {
    expect(buildSyncCommitMessage('other.scope/my-lane', 'b'.repeat(40))).to.include('sync lane other.scope/my-lane');
  });
});

describe('hasSyncMarker as loop guard', () => {
  it('recognizes both sync commit shapes', () => {
    expect(hasSyncMarker(buildSyncCommitMessage('acme.shop/my-lane', 'c'.repeat(40)))).to.equal(true);
    expect(hasSyncMarker('chore(bit-sync): sync git to latest main scope versions\n\n[bit-sync]')).to.equal(true);
  });

  it('recognizes a marker that is part of the subject line, not only a trailer block', () => {
    // `executeMergeDiverged`'s snap message puts the marker inline, so any position has to count.
    expect(hasSyncMarker('merge remote lane acme.shop/my-lane into my-lane [bit-sync]')).to.equal(true);
  });

  it('does not recognize an ordinary commit', () => {
    expect(hasSyncMarker('feat: something')).to.equal(false);
  });
});

// The strict probe: a false positive here costs a developer's branch, not just a skipped run.
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
    const quoted = 'revert the [bit-sync] bitmap churn';
    expect(hasSyncMarker(quoted), 'the loop guard is deliberately permissive here').to.equal(true);
    expect(isSyncAuthoredMessage(quoted)).to.equal(false);
  });

  it('REJECTS the marker quoted on its own line but with text around it', () => {
    expect(isSyncAuthoredMessage('fix: undo\n\nthis reverts a [bit-sync] commit\n')).to.equal(false);
    expect(isSyncAuthoredMessage('chore: mention [bit-sync] here')).to.equal(false);
  });

  it('REJECTS the inline-marker snap message, which is a LANE message and never a branch tip', () => {
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
