import { expect } from 'chai';
import { resolveSyncConfig, laneNameToBranch, branchToLaneName, parseLaneTarget, shouldSyncLane } from './sync-config';

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

  /**
   * The `[lane]` argument's two forms. The scope-qualified one exists because a lane is hosted on one
   * scope while this repository maps another — the hosting scope is administrative and need not match.
   */
  describe('parseLaneTarget', () => {
    const DEFAULT_SCOPE = 'acme.shop';

    it('resolves a bare lane name against the workspace defaultScope', () => {
      expect(parseLaneTarget('my-lane', DEFAULT_SCOPE)).to.deep.equal({ hostScope: DEFAULT_SCOPE, name: 'my-lane' });
    });

    it('splits a scope-qualified lane id into hosting scope and name', () => {
      expect(parseLaneTarget('other-org.other-scope/my-lane', DEFAULT_SCOPE)).to.deep.equal({
        hostScope: 'other-org.other-scope',
        name: 'my-lane',
      });
    });

    it('accepts a hosting scope without a dot (self-hosted and test scopes are bare names)', () => {
      // The '/' is the boundary, not the dot: a dot requirement would reject legitimate scope ids.
      expect(parseLaneTarget('bare-scope/my-lane', DEFAULT_SCOPE)).to.deep.equal({
        hostScope: 'bare-scope',
        name: 'my-lane',
      });
    });

    it('trims surrounding whitespace', () => {
      expect(parseLaneTarget('  my-lane  ', DEFAULT_SCOPE)).to.deep.equal({
        hostScope: DEFAULT_SCOPE,
        name: 'my-lane',
      });
    });

    it('refuses malformed targets rather than guessing at them', () => {
      // Guessing could reconcile the wrong lane onto a branch, so every shape that isn't one of the two
      // accepted forms is an error.
      ['', '   ', '/', '/my-lane', 'scope/', 'a/b/c', 'scope//lane'].forEach((input) => {
        expect(() => parseLaneTarget(input, DEFAULT_SCOPE), `input: "${input}"`).to.throw();
      });
    });
  });

  it('filters lanes by glob list', () => {
    expect(shouldSyncLane('anything', resolveSyncConfig({}))).to.equal(true);
    const cfg = resolveSyncConfig({ lanes: ['feature-*'] });
    expect(shouldSyncLane('feature-x', cfg)).to.equal(true);
    expect(shouldSyncLane('hotfix-y', cfg)).to.equal(false);
    expect(shouldSyncLane('anything', resolveSyncConfig({ lanes: [] }))).to.equal(false);
  });
});
