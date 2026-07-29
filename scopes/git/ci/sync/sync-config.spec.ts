import { expect } from 'chai';
import { resolveSyncConfig, laneNameToBranch, branchToLaneName, shouldSyncLane } from './sync-config';

describe('sync-config', () => {
  it('applies defaults', () => {
    const cfg = resolveSyncConfig(undefined);
    expect(cfg.mode).to.equal('git-source-of-truth');
    expect(cfg.branchPrefix).to.equal('');
    expect(cfg.branches).to.deep.equal({});
    expect(cfg.lanes).to.deep.equal(['*']);
    expect(cfg.mainSyncBranch).to.equal('bit-sync/main');
    expect(cfg.autoMergeMainSyncPr).to.equal(false);
  });

  it('maps lane to branch via prefix', () => {
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/' });
    expect(laneNameToBranch('my-lane', cfg)).to.equal('lane/my-lane');
  });

  it('explicit branches override wins over prefix', () => {
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/', branches: { 'my-lane': 'custom' } });
    expect(laneNameToBranch('my-lane', cfg)).to.equal('custom');
  });

  it('maps branch back to lane (override, then prefix strip)', () => {
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/', branches: { 'my-lane': 'custom' } });
    expect(branchToLaneName('custom', cfg)).to.equal('my-lane');
    expect(branchToLaneName('lane/other', cfg)).to.equal('other');
    expect(branchToLaneName('unrelated-branch', cfg)).to.equal(undefined);
  });

  it('when no prefix and no override, branch maps to same-named lane', () => {
    const cfg = resolveSyncConfig({});
    expect(branchToLaneName('some-lane', cfg)).to.equal('some-lane');
  });

  it('filters lanes by glob list', () => {
    expect(shouldSyncLane('anything', resolveSyncConfig({}))).to.equal(true);
    const cfg = resolveSyncConfig({ lanes: ['feature-*'] });
    expect(shouldSyncLane('feature-x', cfg)).to.equal(true);
    expect(shouldSyncLane('hotfix-y', cfg)).to.equal(false);
    expect(shouldSyncLane('anything', resolveSyncConfig({ lanes: [] }))).to.equal(false);
  });
});
