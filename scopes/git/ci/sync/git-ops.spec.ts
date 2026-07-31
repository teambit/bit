import { expect } from 'chai';
import type { GitConfigIO } from './git-ops';
import {
  ALL_HEADS_REFSPEC,
  checkoutPristine,
  checkoutPristineRestore,
  localBranchExists,
  DEFAULT_GIT_USER_EMAIL,
  DEFAULT_GIT_USER_NAME,
  ensureGitIdentity,
  fetchRemoteHeads,
  isNonContentPath,
  parseLsRemoteSymref,
  parseOriginHeadRef,
  remoteHeadBranch,
} from './git-ops';

/** A recording stand-in for the two `git config` operations. */
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
  // Passed explicitly — otherwise a developer who exports GIT_USER_NAME fails the suite.
  const NO_ENV = {};

  it('sets both halves in a fresh CI checkout that has neither', async () => {
    const { io, values } = fakeConfig();
    await ensureGitIdentity(io, NO_ENV);
    expect(values['user.email']).to.equal(DEFAULT_GIT_USER_EMAIL);
    expect(values['user.name']).to.equal(DEFAULT_GIT_USER_NAME);
  });

  // Pinning the literals (not the constants) makes cross-repo drift show up as a failing test.
  it('defaults to the identity the scaffolded workflows and the action both document', () => {
    expect(DEFAULT_GIT_USER_NAME).to.equal('bit-sync[bot]');
    expect(DEFAULT_GIT_USER_EMAIL).to.equal('bit-sync[bot]@users.noreply.github.com');
  });

  it('sets the NAME when only the email is configured', async () => {
    const { io, sets, values } = fakeConfig({ 'user.email': 'dev@example.com' });
    await ensureGitIdentity(io, NO_ENV);
    expect(values['user.name']).to.equal(DEFAULT_GIT_USER_NAME);
    // and it leaves the configured half alone — an interactive run keeps the developer's own identity
    expect(values['user.email']).to.equal('dev@example.com');
    expect(sets).to.deep.equal([{ key: 'user.name', value: DEFAULT_GIT_USER_NAME }]);
  });

  it('sets the EMAIL when only the name is configured', async () => {
    const { io, sets, values } = fakeConfig({ 'user.name': 'A Developer' });
    await ensureGitIdentity(io, NO_ENV);
    expect(values['user.email']).to.equal(DEFAULT_GIT_USER_EMAIL);
    expect(values['user.name']).to.equal('A Developer');
    expect(sets).to.deep.equal([{ key: 'user.email', value: DEFAULT_GIT_USER_EMAIL }]);
  });

  it('writes nothing when both are already configured', async () => {
    const { io, sets } = fakeConfig({ 'user.email': 'dev@example.com', 'user.name': 'A Developer' });
    await ensureGitIdentity(io, NO_ENV);
    expect(sets).to.deep.equal([]);
  });

  it('treats an empty configured value as missing, because git does too', async () => {
    const { io, values } = fakeConfig({ 'user.email': '', 'user.name': '' });
    await ensureGitIdentity(io, NO_ENV);
    expect(values['user.email']).to.equal(DEFAULT_GIT_USER_EMAIL);
    expect(values['user.name']).to.equal(DEFAULT_GIT_USER_NAME);
  });

  describe('GIT_USER_NAME / GIT_USER_EMAIL', () => {
    it('uses the env vars when git has no identity configured', async () => {
      const { io, values } = fakeConfig();
      await ensureGitIdentity(io, { GIT_USER_NAME: 'Release Bot', GIT_USER_EMAIL: 'release@acme.example' });
      expect(values['user.name']).to.equal('Release Bot');
      expect(values['user.email']).to.equal('release@acme.example');
    });

    /** Configured identity outranks the environment: the var says "when there is nobody else". */
    it('is IGNORED when git already has an identity — a local run is never rewritten', async () => {
      const { io, sets } = fakeConfig({ 'user.email': 'dev@example.com', 'user.name': 'A Developer' });
      await ensureGitIdentity(io, { GIT_USER_NAME: 'Release Bot', GIT_USER_EMAIL: 'release@acme.example' });
      expect(sets).to.deep.equal([]);
    });

    it('resolves each key independently, so setting one of the pair is coherent', async () => {
      const { io, values } = fakeConfig();
      await ensureGitIdentity(io, { GIT_USER_NAME: 'Release Bot' });
      expect(values['user.name']).to.equal('Release Bot');
      expect(values['user.email']).to.equal(DEFAULT_GIT_USER_EMAIL);
    });

    it('falls back to the default for an env var set to empty, as for one not set at all', async () => {
      const { io, values } = fakeConfig();
      await ensureGitIdentity(io, { GIT_USER_NAME: '', GIT_USER_EMAIL: '' });
      expect(values['user.name']).to.equal(DEFAULT_GIT_USER_NAME);
      expect(values['user.email']).to.equal(DEFAULT_GIT_USER_EMAIL);
    });
  });
});

describe('fetchRemoteHeads', () => {
  it('passes the all-heads refspec explicitly, overriding whatever the checkout configured', async () => {
    const calls: string[][] = [];
    await fetchRemoteHeads(async (args) => {
      calls.push(args);
    });
    expect(calls).to.deep.equal([['fetch', 'origin', ALL_HEADS_REFSPEC]]);
    expect(ALL_HEADS_REFSPEC).to.equal('+refs/heads/*:refs/remotes/origin/*');
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

// A wrong default-branch name does not fail loudly — it protects the wrong branch.
describe('parseOriginHeadRef', () => {
  it('reads the ordinary case', () => {
    expect(parseOriginHeadRef('refs/remotes/origin/main\n')).to.equal('main');
    expect(parseOriginHeadRef('refs/remotes/origin/master')).to.equal('master');
  });

  it('keeps a slash-containing branch name whole', () => {
    expect(parseOriginHeadRef('refs/remotes/origin/release/main')).to.equal('release/main');
    expect(parseOriginHeadRef('refs/remotes/origin/team/x/main\n')).to.equal('team/x/main');
    expect(parseOriginHeadRef('refs/remotes/origin/feature/a/b/c')).to.equal('feature/a/b/c');
  });

  it('returns undefined for a shape it does not recognise, so the caller can fall back', () => {
    expect(parseOriginHeadRef('refs/heads/main')).to.equal(undefined);
    expect(parseOriginHeadRef('fatal: ref refs/remotes/origin/HEAD is not a symbolic ref')).to.equal(undefined);
    expect(parseOriginHeadRef('')).to.equal(undefined);
    expect(parseOriginHeadRef('   ')).to.equal(undefined);
  });

  it('returns undefined for the prefix with nothing after it', () => {
    expect(parseOriginHeadRef('refs/remotes/origin/')).to.equal(undefined);
  });
});

// These rows assert the ORDER of the three steps: a clean after the reload would leave the workspace
// holding a `.bitmap` view of a tree that no longer exists.
describe('checkoutPristine', () => {
  /** Records git argv and the reload interleaved, so ordering between the two is assertable. */
  function recorder() {
    const steps: string[] = [];
    const run = async (args: string[]) => {
      steps.push(args.join(' '));
      // an existing, pushed branch: the guard's rev-parse gets a sha, its containment probe a remote
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'branch') return '  origin/some-branch\n';
      return undefined;
    };
    const reload = async () => {
      steps.push('<reload>');
    };
    return { steps, run, reload };
  }

  const CLEAN = 'clean -fd -e .bit -e node_modules';

  it('with a startPoint: proves the reset is safe, creates-or-resets the branch, cleans, reloads', async () => {
    const { steps, run, reload } = recorder();
    await checkoutPristine('bit-sync/main', 'origin/main', reload, run);
    expect(steps).to.deep.equal([
      'rev-parse --verify --quiet refs/heads/bit-sync/main',
      'branch -r --contains refs/heads/bit-sync/main',
      'checkout -f -B bit-sync/main origin/main',
      CLEAN,
      '<reload>',
    ]);
  });

  // `checkout -B` moves an existing local ref; unpushed commits would be orphaned to the reflog.
  it('REFUSES to reset a local branch whose commits no remote contains, before touching the tree', async () => {
    const steps: string[] = [];
    const run = async (args: string[]) => {
      steps.push(args.join(' '));
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'branch') return '\n';
      return undefined;
    };
    let message = '';
    await checkoutPristine('my-lane', 'origin/my-lane', async () => {}, run).catch((e) => {
      message = e.message;
    });
    expect(message).to.contain('local branch "my-lane" has commits that no remote branch contains');
    expect(steps.some((step) => step.startsWith('checkout'))).to.equal(false);
    expect(steps.some((step) => step.startsWith('clean'))).to.equal(false);
  });

  // Remote containment admits both legitimate reset shapes; start-point ancestry wrongly refuses one.
  it('allows the reset when any remote branch contains the local tip — even a different one than the start point', async () => {
    const steps: string[] = [];
    const run = async (args: string[]) => {
      steps.push(args.join(' '));
      if (args[0] === 'rev-parse') return 'abc123\n';
      if (args[0] === 'branch') return '  origin/policy-lane\n';
      return undefined;
    };
    await checkoutPristine('policy-lane', 'origin/main', async () => {}, run);
    expect(steps.some((step) => step === 'checkout -f -B policy-lane origin/main')).to.equal(true);
  });

  it('skips the safety proof when the branch does not exist locally (every CI clone)', async () => {
    const steps: string[] = [];
    const run = async (args: string[]) => {
      steps.push(args.join(' '));
      if (args[0] === 'rev-parse') return '';
      return undefined;
    };
    await checkoutPristine('my-lane', 'origin/my-lane', async () => {}, run);
    expect(steps.filter((step) => step.startsWith('branch -r'))).to.deep.equal([]);
    expect(steps.some((step) => step === 'checkout -f -B my-lane origin/my-lane')).to.equal(true);
  });

  it('without a startPoint: plain forced switch to an existing branch, then cleans, then reloads', async () => {
    const { steps, run, reload } = recorder();
    await checkoutPristine('main', undefined, reload, run);
    expect(steps).to.deep.equal(['checkout -f main', CLEAN, '<reload>']);
  });

  it('always forces the checkout, in both shapes', async () => {
    for (const startPoint of ['origin/lane/x', undefined]) {
      const { steps, run, reload } = recorder();
      await checkoutPristine('lane/x', startPoint, reload, run);
      const checkout = steps.find((step) => step.startsWith('checkout'));
      expect(checkout?.startsWith('checkout -f ')).to.equal(true);
    }
  });

  // The exclusions are what stop the clean eating the local scope.
  it('cleans with the scoped exclusions, never -x', async () => {
    const { steps, run, reload } = recorder();
    await checkoutPristine('lane/x', 'origin/lane/x', reload, run);
    const clean = steps.find((step) => step.startsWith('clean'));
    expect(clean).to.equal(CLEAN);
    expect(clean).to.not.include('-x');
  });

  it('reloads LAST, so the workspace reads the pristine tree rather than the pre-clean one', async () => {
    const { steps, run, reload } = recorder();
    await checkoutPristine('lane/x', 'origin/lane/x', reload, run);
    expect(steps.indexOf('<reload>')).to.equal(steps.length - 1);
    expect(steps.indexOf(CLEAN)).to.be.lessThan(steps.indexOf('<reload>'));
  });
});

describe('parseLsRemoteSymref / remoteHeadBranch', () => {
  const SYMREF_OUT = 'ref: refs/heads/main\tHEAD\n1234abcd\tHEAD\n';

  it('reads the branch out of the symref line', () => {
    expect(parseLsRemoteSymref(SYMREF_OUT)).to.equal('main');
  });

  /** Same slash discipline as parseOriginHeadRef: `release/main` is a NAME, not a path to shorten. */
  it('keeps a slashed branch name whole', () => {
    expect(parseLsRemoteSymref('ref: refs/heads/release/main\tHEAD\nabc\tHEAD\n')).to.equal('release/main');
  });

  it('returns undefined when the server omits the symref line (protocol v0), rather than guessing', () => {
    expect(parseLsRemoteSymref('1234abcd\tHEAD\n')).to.equal(undefined);
    expect(parseLsRemoteSymref('')).to.equal(undefined);
  });

  it('asks the remote, not the local refs — and swallows an offline failure into undefined', async () => {
    const argv: string[][] = [];
    expect(
      await remoteHeadBranch(async (args) => {
        argv.push(args);
        return SYMREF_OUT;
      })
    ).to.equal('main');
    expect(argv).to.deep.equal([['ls-remote', '--symref', 'origin', 'HEAD']]);
    expect(
      await remoteHeadBranch(async () => {
        throw new Error('could not read from remote repository');
      })
    ).to.equal(undefined);
  });
});

describe('localBranchExists', () => {
  it('asks for the LOCAL ref, quietly verified — never a remote-tracking one', async () => {
    const argv: string[][] = [];
    await localBranchExists('main', async (args) => {
      argv.push(args);
      return 'abc123';
    });
    expect(argv).to.deep.equal([['rev-parse', '--verify', '--quiet', 'refs/heads/main']]);
  });

  // simple-git's `raw` can resolve with empty output on non-zero exits, so all three missing-branch
  // runner behaviors (empty resolve, undefined resolve, rejection) must be false.
  it('true only when the ref prints a sha; false for empty, undefined, or throwing runners', async () => {
    expect(await localBranchExists('main', async () => 'abc123\n')).to.equal(true);
    expect(await localBranchExists('main', async () => '')).to.equal(false);
    expect(await localBranchExists('main', async () => undefined)).to.equal(false);
    expect(
      await localBranchExists('main', async () => {
        throw new Error('exit 1');
      })
    ).to.equal(false);
  });
});

// Each shape is wrong in the other environment: `-B origin/<branch>` in a developer's repo resets
// their default branch; a plain switch in a detached-HEAD CI checkout fails outright.
describe('checkoutPristineRestore', () => {
  function restoreRecorder(localBranchIsPresent: boolean) {
    const steps: string[] = [];
    const run = async (args: string[]) => {
      steps.push(args.join(' '));
      // model the REAL runner: a missing ref resolves with empty output rather than rejecting
      if (args[0] === 'rev-parse') return localBranchIsPresent ? 'abc123\n' : '';
      if (args[0] === 'branch') return '  origin/some-branch\n';
      return undefined;
    };
    const reload = async () => {
      steps.push('<reload>');
    };
    return { steps, run, reload };
  }

  it('local branch present: plain forced switch — never a -B that would reset it to origin', async () => {
    const { steps, run, reload } = restoreRecorder(true);
    await checkoutPristineRestore('main', reload, run);
    expect(steps).to.deep.equal([
      'rev-parse --verify --quiet refs/heads/main',
      'checkout -f main',
      'clean -fd -e .bit -e node_modules',
      '<reload>',
    ]);
  });

  it('local branch absent (detached-HEAD CI): forks it from origin/<branch> instead of failing', async () => {
    const { steps, run, reload } = restoreRecorder(false);
    await checkoutPristineRestore('main', reload, run);
    // the second rev-parse is checkoutPristine's own reset guard re-proving what restore just learned —
    // redundant but harmless, and cheaper than giving the guard a bypass parameter
    expect(steps).to.deep.equal([
      'rev-parse --verify --quiet refs/heads/main',
      'rev-parse --verify --quiet refs/heads/main',
      'checkout -f -B main origin/main',
      'clean -fd -e .bit -e node_modules',
      '<reload>',
    ]);
  });
});
