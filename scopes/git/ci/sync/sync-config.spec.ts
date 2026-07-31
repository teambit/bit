import { expect } from 'chai';
import type { CiSyncConfig, LaneTarget } from './sync-config';
import {
  resolveSyncConfig,
  laneNameToBranch,
  branchToLaneName,
  isValidLaneName,
  parseLaneTarget,
  shouldSyncLane,
} from './sync-config';

const DEFAULT_SCOPE = 'acme.shop';

describe('sync-config', () => {
  it('applies defaults', () => {
    expect(resolveSyncConfig(undefined)).to.deep.equal({
      mode: 'git-source-of-truth',
      branchPrefix: '',
      branches: {},
      lanes: ['*'],
      mainSyncBranch: 'bit-sync/main',
      autoMergeMainSyncPr: false,
      mainSync: 'pr',
      // a silent policy pick rewrites someone's work, so silence is opt-in
      onConflict: 'halt',
    });
  });

  it('accepts every documented value of the union-typed options', () => {
    (['pr', 'direct-push'] as const).forEach((v) => expect(resolveSyncConfig({ mainSync: v }).mainSync).to.equal(v));
    (['halt', 'git-wins', 'lane-wins'] as const).forEach((v) =>
      expect(resolveSyncConfig({ onConflict: v }).onConflict).to.equal(v)
    );
  });

  // Config comes from workspace.jsonc, so the union types are not enforced at runtime: a typo must fail
  // at startup naming the key, the value and the options, not fall through to whichever mode a
  // comparison happens to miss.
  const REJECTED: Array<[CiSyncConfig, RegExp]> = [
    [{ mainSync: 'direct' as any }, /sync\.mainSync.*"direct".*"pr".*"direct-push"/],
    [{ onConflict: 'ours' as any }, /sync\.onConflict.*"ours".*"halt".*"git-wins".*"lane-wins"/],
  ];

  REJECTED.forEach(([raw, expected]) => {
    it(`refuses ${JSON.stringify(raw)}, naming the key, the value and the valid options`, () => {
      expect(() => resolveSyncConfig(raw)).to.throw(expected);
    });
  });

  it('maps lane <-> branch: an explicit override outranks the prefix in both directions', () => {
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/', branches: { 'my-lane': 'custom' } });
    expect(laneNameToBranch('my-lane', cfg)).to.equal('custom');
    expect(branchToLaneName('custom', cfg)).to.equal('my-lane');
    expect(branchToLaneName('lane/other', cfg)).to.equal('other');
    expect(branchToLaneName('unrelated-branch', cfg)).to.equal(undefined);
    // with no prefix and no override, a branch maps to the same-named lane
    expect(branchToLaneName('some-lane', resolveSyncConfig({}))).to.equal('some-lane');
  });

  describe('parseLaneTarget', () => {
    // A lane name cannot contain '/', so the single '/' is always the scope/name boundary; a hosting
    // scope needs no dot (self-hosted and test scopes are bare names).
    const PARSED: Array<[string, LaneTarget]> = [
      ['my-lane', { hostScope: DEFAULT_SCOPE, name: 'my-lane' }],
      ['other-org.other-scope/my-lane', { hostScope: 'other-org.other-scope', name: 'my-lane' }],
      ['bare-scope/my-lane', { hostScope: 'bare-scope', name: 'my-lane' }],
      ['  my-lane  ', { hostScope: DEFAULT_SCOPE, name: 'my-lane' }],
    ];

    it('resolves a bare name against defaultScope and splits a scope-qualified id', () => {
      PARSED.forEach(([input, expected]) =>
        expect(parseLaneTarget(input, DEFAULT_SCOPE), input).to.deep.equal(expected)
      );
    });

    it('refuses malformed targets rather than guessing at them', () => {
      ['', '   ', '/', '/my-lane', 'scope/', 'a/b/c', 'scope//lane'].forEach((input) =>
        expect(() => parseLaneTarget(input, DEFAULT_SCOPE), `input: "${input}"`).to.throw()
      );
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

  it('rejects uppercase, spaces, dots, the empty string, and the slash a branch name brings in', () => {
    ['FEATURE', 'Feature', 'a b', 'a.b', '', 'a+b', 'café', 'feature/foo', 'a/b/c'].forEach((name) =>
      expect(isValidLaneName(name), JSON.stringify(name)).to.equal(false)
    );
  });

  it("rejects a name past bit's length limit", () => {
    expect(isValidLaneName('a'.repeat(800))).to.equal(true);
    expect(isValidLaneName('a'.repeat(801))).to.equal(false);
  });
});
