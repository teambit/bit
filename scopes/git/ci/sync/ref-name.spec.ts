import { expect } from 'chai';
import { assertValidBranchName, assertValidBranchPrefix, isValidGitBranchName, validateBranchName } from './ref-name';
import { resolveSyncConfig, laneNameToBranch } from './sync-config';

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
  ...['--force', '-delete'],
  // characters and sequences git forbids in a ref, plus control characters
  ...['a b', 'a\tb', 'a..b', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a@{b', '@'],
  ...['a\u0001b', 'a\u007fb'],
  // path-shape rules
  ...['', '/x', 'x/', 'a//b', 'a.', 'a.lock', '.hidden', 'a/.hidden', 'a/b.lock'],
  // stricter than git on purpose: every push interpolates the value into `refs/heads/<b>`
  ...['refs/heads/foo', 'refs/foo', 'refs/remotes/origin/foo'],
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
