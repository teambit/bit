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
  });

  /**
   * `mainSync` decides whether the default branch gets written, so a value that is neither mode must
   * fail at startup naming the key — not fall through to whichever mode a comparison happens to miss.
   */
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

/**
 * The rule bit itself enforces when a lane is created (`isValidLaneName` in
 * `scopes/lanes/modules/create-lane/create-lane.ts`). Pinned here because this module re-states it rather
 * than importing it, so a divergence from bit's copy shows up as a failure rather than as a lane that
 * silently stops syncing.
 */
describe('isValidLaneName', () => {
  it('accepts what bit accepts: lowercase alphanumerics plus - _ $ !', () => {
    ['my-lane', 'lane_1', 'a', 'x$y', 'w!', 'release-2'].forEach((name) =>
      expect(isValidLaneName(name), name).to.equal(true)
    );
  });

  /**
   * THE case that motivated this. Under the default `branchPrefix: ''` every branch name maps to a
   * same-named "lane", so an ordinary `feature/foo` becomes a lane name containing `/` — which bit forbids
   * (its own TODO in create-lane notes the collision with the `scope/lane` delimiter), which breaks
   * `LaneTarget.name`'s no-slash invariant, and which `parseLaneTarget` would mis-split into a bogus
   * scope.
   */
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
