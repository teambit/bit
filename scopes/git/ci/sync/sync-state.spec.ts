import { expect } from 'chai';
import {
  LANE_HEAD_TRAILER,
  SYNC_COMMIT_MARKER,
  buildSyncCommitMessage,
  hasSyncMarker,
  isSyncAuthoredMessage,
} from './sync-state';

const LANE_SYNC = buildSyncCommitMessage('acme.shop/my-lane', 'a'.repeat(40));
const MAIN_SYNC = 'chore(bit-sync): sync git to latest main scope versions\n\n[bit-sync]';
/** `executeMergeDiverged`'s snap message: a LANE message, whose marker is inline and never a tip. */
const LANE_SNAP = 'merge remote lane acme.shop/my-lane into my-lane [bit-sync]';

describe('buildSyncCommitMessage', () => {
  it('names the lane scope-qualified in the subject and carries both annotations', () => {
    expect(LANE_SYNC.split('\n', 1)[0]).to.equal(`chore(bit-sync): sync lane acme.shop/my-lane @ ${'a'.repeat(9)}`);
    expect(LANE_SYNC).to.include(`${LANE_HEAD_TRAILER}: ${'a'.repeat(40)}`);
    expect(LANE_SYNC).to.include(SYNC_COMMIT_MARKER);
    expect(buildSyncCommitMessage('other.scope/my-lane', 'b'.repeat(40))).to.include('sync lane other.scope/my-lane');
  });
});

/**
 * `hasSyncMarker` is the permissive loop guard; `isSyncAuthoredMessage` is an input to branch DELETION,
 * so a false positive there costs a developer's branch. Every row states both answers, and the rows
 * where they disagree are the laundering holes the strict probe exists to close.
 */
const MESSAGES: Array<[string, string, boolean, boolean]> = [
  // message, hasSyncMarker, isSyncAuthoredMessage
  ['what buildSyncCommitMessage produces', LANE_SYNC, true, true],
  ['the raw `git log %B` shape, trailing newline and all', `${LANE_SYNC}\n`, true, true],
  ['the main-scope sync commit, whose marker is also its own line', MAIN_SYNC, true, true],
  ['CRLF line endings', `subject\r\n\r\n${SYNC_COMMIT_MARKER}\r\n`, true, true],
  ['a message that merely quotes the marker mid-line', 'revert the [bit-sync] bitmap churn', true, false],
  ['the marker quoted mid-line inside a body', 'fix: undo\n\nthis reverts a [bit-sync] commit\n', true, false],
  ['the marker mentioned in a subject', 'chore: mention [bit-sync] here', true, false],
  ['the inline-marker lane snap message', LANE_SNAP, true, false],
  ['an ordinary commit', 'feat: something', false, false],
  ['the lane-head trailer on its own', `${LANE_HEAD_TRAILER}: ${'c'.repeat(40)}`, false, false],
];

describe('sync-commit recognition', () => {
  MESSAGES.forEach(([name, message, marker, authored]) => {
    it(`${authored ? 'accepts' : 'REJECTS'} ${name}`, () => {
      expect(hasSyncMarker(message), 'loop guard').to.equal(marker);
      expect(isSyncAuthoredMessage(message), 'deletion gate').to.equal(authored);
    });
  });
});
