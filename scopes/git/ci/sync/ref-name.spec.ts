import { expect } from 'chai';
import { assertValidBranchName, assertValidBranchPrefix, isValidGitBranchName, validateBranchName } from './ref-name';
import { resolveSyncConfig, laneNameToBranch } from './sync-config';

describe('isValidGitBranchName', () => {
  it('accepts the shapes real configs use', () => {
    ['main', 'bit-sync/main', 'lane/my-lane', 'feature/ABC-123_thing', 'release-2.0', 'a'].forEach((name) =>
      expect(isValidGitBranchName(name), name).to.equal(true)
    );
  });

  it('rejects an option-like leading dash', () => {
    expect(isValidGitBranchName('--force')).to.equal(false);
    expect(isValidGitBranchName('-delete')).to.equal(false);
    expect(validateBranchName('-x')).to.contain('command-line option');
  });

  it("rejects every character git forbids in a ref, and the sequences it won't allow", () => {
    ['a b', 'a\tb', 'a..b', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a@{b', '@'].forEach((name) =>
      expect(isValidGitBranchName(name), JSON.stringify(name)).to.equal(false)
    );
  });

  it('rejects the path-shape rules', () => {
    ['', '/x', 'x/', 'a//b', 'a.', 'a.lock', '.hidden', 'a/.hidden', 'a/b.lock'].forEach((name) =>
      expect(isValidGitBranchName(name), JSON.stringify(name)).to.equal(false)
    );
  });

  // Stricter than git on purpose: every push interpolates the value into `refs/heads/<b>`.
  it('rejects a leading "refs/", and says to configure the bare branch name', () => {
    ['refs/heads/foo', 'refs/foo', 'refs/remotes/origin/foo'].forEach((name) =>
      expect(isValidGitBranchName(name), name).to.equal(false)
    );
    expect(validateBranchName('refs/heads/main')).to.contain('bare branch name');
  });

  it('accepts "refs/" in the middle, which git allows and no refspec here doubles', () => {
    ['feature/refs/foo', 'my-refs/foo', 'lane/refs', 'refs'].forEach((name) =>
      expect(isValidGitBranchName(name), name).to.equal(true)
    );
  });

  it('rejects control characters', () => {
    expect(isValidGitBranchName('a\u0001b')).to.equal(false);
    expect(isValidGitBranchName('a\u007fb')).to.equal(false);
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
  });

  it('is silent for a valid name', () => {
    expect(() => assertValidBranchName('bit-sync/main', 'sync.mainSyncBranch')).to.not.throw();
  });
});

describe('assertValidBranchPrefix', () => {
  it('accepts an empty prefix (the default) and ordinary directory-ish prefixes', () => {
    expect(() => assertValidBranchPrefix('', 'sync.branchPrefix')).to.not.throw();
    expect(() => assertValidBranchPrefix('lane/', 'sync.branchPrefix')).to.not.throw();
    expect(() => assertValidBranchPrefix('bit-', 'sync.branchPrefix')).to.not.throw();
  });

  it('rejects a prefix that could never start a valid name', () => {
    expect(() => assertValidBranchPrefix('-x', 'sync.branchPrefix')).to.throw('sync.branchPrefix');
    expect(() => assertValidBranchPrefix('a b/', 'sync.branchPrefix')).to.throw();
    expect(() => assertValidBranchPrefix('a..b/', 'sync.branchPrefix')).to.throw();
    // an empty path component in the prefix must not be collapsed away by the check
    expect(() => assertValidBranchPrefix('lane//', 'sync.branchPrefix')).to.throw();
  });
});

describe('resolveSyncConfig validates branch names up front', () => {
  it('rejects a mainSyncBranch git could not accept', () => {
    expect(() => resolveSyncConfig({ mainSyncBranch: '--force' })).to.throw('sync.mainSyncBranch');
  });

  it('rejects a branches override git could not accept, naming the lane', () => {
    expect(() => resolveSyncConfig({ branches: { 'my-lane': 'a..b' } })).to.throw('sync.branches["my-lane"]');
  });

  it('rejects a branchPrefix that could never start a valid name', () => {
    expect(() => resolveSyncConfig({ branchPrefix: '-x' })).to.throw('sync.branchPrefix');
    // a `refs/`-rooted prefix double-prefixes every derived branch, not just one configured name
    expect(() => resolveSyncConfig({ branchPrefix: 'refs/heads/' })).to.throw('sync.branchPrefix');
  });

  it('rejects a fully-qualified ref where a branch name belongs', () => {
    expect(() => resolveSyncConfig({ mainSyncBranch: 'refs/heads/bit-sync/main' })).to.throw('sync.mainSyncBranch');
  });

  it('accepts the documented defaults unchanged', () => {
    const cfg = resolveSyncConfig();
    expect(cfg.mainSyncBranch).to.equal('bit-sync/main');
    expect(cfg.branchPrefix).to.equal('');
  });
});

describe('laneNameToBranch validates the derived name', () => {
  it('catches a prefix + lane name that only together form something git refuses', () => {
    // `lane.` is a fine prefix on its own; appending a lane name ending the branch in "." is not.
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/' });
    expect(() => laneNameToBranch('x.', cfg)).to.throw('not a valid git branch name');
  });

  it('passes a normal mapping through untouched', () => {
    const cfg = resolveSyncConfig({ branchPrefix: 'lane/' });
    expect(laneNameToBranch('my-lane', cfg)).to.equal('lane/my-lane');
  });

  it('returns an override as configured (already validated by resolveSyncConfig)', () => {
    const cfg = resolveSyncConfig({ branches: { 'my-lane': 'custom/branch' } });
    expect(laneNameToBranch('my-lane', cfg)).to.equal('custom/branch');
  });
});
