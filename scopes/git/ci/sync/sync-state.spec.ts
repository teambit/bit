import { expect } from 'chai';
import { parseLaneHeadTrailer, buildSyncCommitMessage, isSyncCommitMessage } from './sync-state';

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
});
