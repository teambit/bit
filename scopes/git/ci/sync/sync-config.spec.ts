import { expect } from 'chai';
import type { CiSyncConfig, LaneTarget } from './sync-config';
import {
  syncableLaneNameForBranch,
  assertValidBranchName,
  assertValidBranchPrefix,
  isValidGitBranchName,
  validateBranchName,
  resolveSyncConfig,
  laneNameToBranch,
  branchToLaneName,
  isValidLaneName,
  parseLaneTarget,
  shouldSyncLane,
} from './sync-config';

const DEFAULT_SCOPE = 'acme.shop';

/** `refs/` in the middle is git-legal and no refspec here doubles it, so only a LEADING one is refused. */
const VALID = [
  'main',
  'bit-sync/main',
  'lane/my-lane',
  'feature/ABC-123_thing',
  'release-2.0',
  'a',
  'feature/refs/foo',
  'my-refs/foo',
  'lane/refs',
  'refs',
];

const INVALID = [
  // an option-like leading dash — git would read it as a command-line option
  '--force',
  '-delete',
  // characters and sequences git forbids in a ref, plus control characters
  'a b',
  'a\tb',
  'a..b',
  'a~b',
  'a^b',
  'a:b',
  'a?b',
  'a*b',
  'a[b',
  'a\\b',
  'a@{b',
  '@',
  'a\u0001b',
  'a\u007fb',
  // path-shape rules
  '',
  '/x',
  'x/',
  'a//b',
  'a.',
  'a.lock',
  '.hidden',
  'a/.hidden',
  'a/b.lock',
  // stricter than git on purpose: every push interpolates the value into `refs/heads/<b>`
  'refs/heads/foo',
  'refs/foo',
  'refs/remotes/origin/foo',
];

describe('isValidGitBranchName', () => {
  it('accepts the shapes real configs use', () => {
    VALID.forEach((name) => expect(isValidGitBranchName(name), name).to.equal(true));
  });

  it('rejects every shape git would refuse, plus the two this module is stricter about', () => {
    INVALID.forEach((name) => expect(isValidGitBranchName(name), JSON.stringify(name)).to.equal(false));
  });

  it('says what is wrong in the terms the user has to act on', () => {
    expect(validateBranchName('-x')).to.contain('command-line option');
    expect(validateBranchName('refs/heads/main')).to.contain('bare branch name');
  });
});

describe('assertValidBranchName', () => {
  it('names the offending config key and value, so the message points at the line to fix', () => {
    let message = '';
    try {
      assertValidBranchName('--force', 'sync.branches["my-lane"]');
    } catch (err: any) {
      message = err.message;
    }
    expect(message).to.contain('sync.branches["my-lane"]');
    expect(message).to.contain('--force');
    expect(message).to.contain('workspace.jsonc');
    expect(() => assertValidBranchName('bit-sync/main', 'sync.mainSyncBranch')).to.not.throw();
  });
});

describe('assertValidBranchPrefix', () => {
  it('accepts an empty prefix (the default) and ordinary directory-ish prefixes', () => {
    ['', 'lane/', 'bit-'].forEach((prefix) =>
      expect(() => assertValidBranchPrefix(prefix, 'sync.branchPrefix'), prefix).to.not.throw()
    );
  });

  it('rejects a prefix that could never start a valid name', () => {
    // 'lane//' — an empty path component in the prefix must not be collapsed away by the check
    ['-x', 'a b/', 'a..b/', 'lane//'].forEach((prefix) =>
      expect(() => assertValidBranchPrefix(prefix, 'sync.branchPrefix'), prefix).to.throw('sync.branchPrefix')
    );
  });
});

describe('resolveSyncConfig validates branch names up front', () => {
  /** A bad name must fail at startup naming its config key, not mid-run with git's own ref error. */
  const rejected: Array<[string, Parameters<typeof resolveSyncConfig>[0]]> = [
    ['sync.mainSyncBranch', { mainSyncBranch: '--force' }],
    // a fully-qualified ref where a bare branch name belongs
    ['sync.mainSyncBranch', { mainSyncBranch: 'refs/heads/bit-sync/main' }],
    ['sync.branches["my-lane"]', { branches: { 'my-lane': 'a..b' } }],
    ['sync.branchPrefix', { branchPrefix: '-x' }],
    // a `refs/`-rooted prefix double-prefixes every derived branch, not just one configured name
    ['sync.branchPrefix', { branchPrefix: 'refs/heads/' }],
  ];

  rejected.forEach(([key, raw]) => {
    it(`rejects ${JSON.stringify(raw)} naming ${key}`, () => {
      expect(() => resolveSyncConfig(raw)).to.throw(key);
    });
  });

  it('accepts the documented defaults unchanged', () => {
    const cfg = resolveSyncConfig();
    expect(cfg.mainSyncBranch).to.equal('bit-sync/main');
    expect(cfg.branchPrefix).to.equal('');
  });
});

describe('laneNameToBranch validates the derived name', () => {
  it('catches a prefix + lane name that only together form something git refuses', () => {
    // `lane/` is a fine prefix on its own; appending a lane name ending the branch in "." is not.
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/' });
    expect(() => laneNameToBranch('x.', cfg)).to.throw('not a valid git branch name');
    expect(laneNameToBranch('my-lane', cfg)).to.equal('lane/my-lane');
  });

  it('returns an override as configured (already validated by resolveSyncConfig)', () => {
    expect(laneNameToBranch('my-lane', resolveSyncConfig({ branches: { 'my-lane': 'custom/branch' } }))).to.equal(
      'custom/branch'
    );
  });
});

describe('sync-config', () => {
  it('applies defaults', () => {
    expect(resolveSyncConfig(undefined)).to.deep.equal({
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

/**
 * `--all` maps every remote branch through here; anything it returns becomes a sync target whose branch
 * name is then derived and validated. So the two directions must agree, or an ordinary developer branch
 * halts the run instead of being skipped.
 */
describe('syncableLaneNameForBranch round-trips lane and branch validity', () => {
  const cfg = (raw: CiSyncConfig = {}) => resolveSyncConfig({ lanes: ['*'], ...raw });

  it('maps an ordinary branch to its lane name', () => {
    expect(syncableLaneNameForBranch('my-lane', cfg())).to.equal('my-lane');
  });

  it('skips a branch whose mapped lane name is valid as a LANE but not usable as a BRANCH', () => {
    // the lane grammar permits `-`, so `-x` is a legal lane name — but git reads it as an option, and
    // `laneNameToBranch` asserts on it. Enumeration must skip such a branch, not adopt it as a target.
    expect(isValidLaneName('-x')).to.equal(true);
    expect(syncableLaneNameForBranch('-x', cfg())).to.equal(undefined);
    expect(syncableLaneNameForBranch('--force', cfg())).to.equal(undefined);
  });

  it('skips a branch whose name bit forbids as a lane', () => {
    expect(syncableLaneNameForBranch('feature/foo', cfg())).to.equal(undefined);
  });

  it('honours a configured override, which resolveSyncConfig already validated', () => {
    expect(syncableLaneNameForBranch('release/x', cfg({ branches: { 'lane-x': 'release/x' } }))).to.equal('lane-x');
  });

  it('applies the round trip through a configured prefix too', () => {
    const prefixed = cfg({ branchPrefix: 'bit-sync/' });
    expect(syncableLaneNameForBranch('bit-sync/my-lane', prefixed)).to.equal('my-lane');
    expect(syncableLaneNameForBranch('my-lane', prefixed)).to.equal(undefined);
  });
});
