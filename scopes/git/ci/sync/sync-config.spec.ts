import { expect } from 'chai';
import {
  resolveSyncConfig,
  laneNameToBranch,
  branchToLaneName,
  isValidLaneName,
  parseLaneTarget,
  shouldSyncLane,
} from './sync-config';

describe('sync-config', () => {
  it('applies defaults', () => {
    const cfg = resolveSyncConfig(undefined);
    expect(cfg.mode).to.equal('git-source-of-truth');
    expect(cfg.branchPrefix).to.equal('');
    expect(cfg.branches).to.deep.equal({});
    expect(cfg.lanes).to.deep.equal(['*']);
    expect(cfg.mainSyncBranch).to.equal('bit-sync/main');
    expect(cfg.autoMergeMainSyncPr).to.equal(false);
    expect(cfg.mainSync).to.equal('pr');
    expect(cfg.onConflict).to.equal('halt');
  });

  describe('mainSync', () => {
    it('accepts both modes explicitly', () => {
      expect(resolveSyncConfig({ mainSync: 'pr' }).mainSync).to.equal('pr');
      expect(resolveSyncConfig({ mainSync: 'direct-push' }).mainSync).to.equal('direct-push');
    });

    it('refuses any other value, naming the key, the value and the valid options', () => {
      expect(() => resolveSyncConfig({ mainSync: 'direct' as any })).to.throw(
        /sync\.mainSync.*"direct".*"pr".*"direct-push"/
      );
    });
  });

  describe('onConflict', () => {
    it('defaults to halt — a silent policy pick rewrites someone’s work, so silence is opt-in', () => {
      expect(resolveSyncConfig({}).onConflict).to.equal('halt');
    });

    it('accepts all three policies explicitly', () => {
      expect(resolveSyncConfig({ onConflict: 'halt' }).onConflict).to.equal('halt');
      expect(resolveSyncConfig({ onConflict: 'git-wins' }).onConflict).to.equal('git-wins');
      expect(resolveSyncConfig({ onConflict: 'lane-wins' }).onConflict).to.equal('lane-wins');
    });

    it('refuses any other value, naming the key, the value and the valid options', () => {
      expect(() => resolveSyncConfig({ onConflict: 'ours' as any })).to.throw(
        /sync\.onConflict.*"ours".*"halt".*"git-wins".*"lane-wins"/
      );
    });
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

// Pins bit's own rule (create-lane.ts), which this module re-states rather than imports.
describe('isValidLaneName', () => {
  it('accepts what bit accepts: lowercase alphanumerics plus - _ $ !', () => {
    ['my-lane', 'lane_1', 'a', 'x$y', 'w!', 'release-2'].forEach((name) =>
      expect(isValidLaneName(name), name).to.equal(true)
    );
  });

  it('rejects a slash, which is what an ordinary branch name brings in', () => {
    expect(isValidLaneName('feature/foo')).to.equal(false);
    expect(isValidLaneName('a/b/c')).to.equal(false);
  });

  it('rejects uppercase, spaces, dots and the empty string', () => {
    ['FEATURE', 'Feature', 'a b', 'a.b', '', 'a+b', 'café'].forEach((name) =>
      expect(isValidLaneName(name), JSON.stringify(name)).to.equal(false)
    );
  });

  it("rejects a name past bit's length limit", () => {
    expect(isValidLaneName('a'.repeat(800))).to.equal(true);
    expect(isValidLaneName('a'.repeat(801))).to.equal(false);
  });
});
