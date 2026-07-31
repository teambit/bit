import { expect } from 'chai';
import type { GitConfigIO } from './git-ops';
import { ensureGitIdentity, isNonContentPath, parseOriginHeadRef } from './git-ops';

/**
 * A recording stand-in for the two `git config` operations, so the decision can be tested without a git
 * repository — which is the point: the bug being locked here only shows up in checkouts whose config is
 * *partially* set, and constructing those for real is far more machinery than the rule deserves.
 */
function fakeConfig(initial: Record<string, string> = {}) {
  const values: Record<string, string> = { ...initial };
  const sets: Array<{ key: string; value: string }> = [];
  const io: GitConfigIO = {
    get: async (key) => values[key],
    set: async (key, value) => {
      values[key] = value;
      sets.push({ key, value });
    },
  };
  return { io, sets, values };
}

describe('ensureGitIdentity', () => {
  it('sets both halves in a fresh CI checkout that has neither', async () => {
    const { io, values } = fakeConfig();
    await ensureGitIdentity(io);
    expect(values['user.email']).to.equal('bit-ci[bot]@bit.cloud');
    expect(values['user.name']).to.equal('Bit CI');
  });

  /**
   * THE regression. The check used to test `user.email` alone and return early on it, so a checkout with
   * an email but no name — a half-populated global config, a container that sets only `EMAIL`, a
   * `.gitconfig` carrying `[user] email` and nothing else — passed and then died at `git commit` with
   * `*** Please tell me who you are`, aborting every lane in the run. git needs both.
   */
  it('sets the NAME when only the email is configured', async () => {
    const { io, sets, values } = fakeConfig({ 'user.email': 'dev@example.com' });
    await ensureGitIdentity(io);
    expect(values['user.name']).to.equal('Bit CI');
    // and it leaves the configured half alone — an interactive run keeps the developer's own identity
    expect(values['user.email']).to.equal('dev@example.com');
    expect(sets).to.deep.equal([{ key: 'user.name', value: 'Bit CI' }]);
  });

  it('sets the EMAIL when only the name is configured', async () => {
    const { io, sets, values } = fakeConfig({ 'user.name': 'A Developer' });
    await ensureGitIdentity(io);
    expect(values['user.email']).to.equal('bit-ci[bot]@bit.cloud');
    expect(values['user.name']).to.equal('A Developer');
    expect(sets).to.deep.equal([{ key: 'user.email', value: 'bit-ci[bot]@bit.cloud' }]);
  });

  it('writes nothing when both are already configured', async () => {
    const { io, sets } = fakeConfig({ 'user.email': 'dev@example.com', 'user.name': 'A Developer' });
    await ensureGitIdentity(io);
    expect(sets).to.deep.equal([]);
  });

  it('treats an empty configured value as missing, because git does too', async () => {
    const { io, values } = fakeConfig({ 'user.email': '', 'user.name': '' });
    await ensureGitIdentity(io);
    expect(values['user.email']).to.equal('bit-ci[bot]@bit.cloud');
    expect(values['user.name']).to.equal('Bit CI');
  });
});

describe('isNonContentPath', () => {
  it('covers the two paths the executors never treat as workspace content', () => {
    expect(isNonContentPath('.bit')).to.equal(true);
    expect(isNonContentPath('.bit/objects/ab/cdef')).to.equal(true);
    expect(isNonContentPath('node_modules/lodash/index.js')).to.equal(true);
  });

  it('does not match a component whose path merely starts with the same letters', () => {
    expect(isNonContentPath('.bitmap')).to.equal(false);
    expect(isNonContentPath('node_modules_backup/x')).to.equal(false);
  });
});

/**
 * The default branch name is what the sync flow *protects*: the reserved-branch guard refuses to let a lane
 * write to it, every `isAncestor` reachability test measures against it, and it is what gets merged into a
 * sync branch to keep the PR mergeable. A wrong value here does not fail loudly — it protects the wrong
 * branch and leaves the real one unguarded.
 */
describe('parseOriginHeadRef', () => {
  it('reads the ordinary case', () => {
    expect(parseOriginHeadRef('refs/remotes/origin/main\n')).to.equal('main');
    expect(parseOriginHeadRef('refs/remotes/origin/master')).to.equal('master');
  });

  /**
   * THE regression. The old implementation was `result.trim().split('/').pop()`, which reduced
   * `refs/remotes/origin/release/main` to `main` — so a repository whose default branch really is
   * `release/main` had an unrelated `main` protected in its place.
   */
  it('keeps a slash-containing branch name whole', () => {
    expect(parseOriginHeadRef('refs/remotes/origin/release/main')).to.equal('release/main');
    expect(parseOriginHeadRef('refs/remotes/origin/team/x/main\n')).to.equal('team/x/main');
    expect(parseOriginHeadRef('refs/remotes/origin/feature/a/b/c')).to.equal('feature/a/b/c');
  });

  it('returns undefined for a shape it does not recognise, so the caller can fall back', () => {
    // Guessing here would be worse than probing: a wrong name protects the wrong branch.
    expect(parseOriginHeadRef('refs/heads/main')).to.equal(undefined);
    expect(parseOriginHeadRef('fatal: ref refs/remotes/origin/HEAD is not a symbolic ref')).to.equal(undefined);
    expect(parseOriginHeadRef('')).to.equal(undefined);
    expect(parseOriginHeadRef('   ')).to.equal(undefined);
  });

  it('returns undefined for the prefix with nothing after it', () => {
    expect(parseOriginHeadRef('refs/remotes/origin/')).to.equal(undefined);
  });
});
