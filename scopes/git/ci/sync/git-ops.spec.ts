import { expect } from 'chai';
import type { GitConfigIO } from './git-ops';
import {
  ALL_HEADS_REFSPEC,
  SYNC_EXCLUDED_PATHS,
  addAllExceptScopeAndModules,
  assertCheckoutableBranch,
  checkoutPristine,
  checkoutPristineRestore,
  commitWithIdentity,
  deleteBranchArgs,
  localBranchExists,
  DEFAULT_GIT_USER_EMAIL,
  DEFAULT_GIT_USER_NAME,
  fetchRemoteHeads,
  isNonContentPath,
  isStaleLeaseRejection,
  parseLsRemoteSymref,
  parseOriginHeadRef,
  refetchBranchTip,
  remoteHeadBranch,
  resolveGitIdentity,
  singleHeadRefspec,
} from './git-ops';

/** A read-only stand-in for `git config --get`. There is no setter: nothing may write the config. */
function fakeConfig(initial: Record<string, string> = {}): GitConfigIO {
  return { get: async (key) => initial[key] };
}

const DEV = { 'user.email': 'dev@example.com', 'user.name': 'A Developer' };
const BOT_ENV = { GIT_USER_NAME: 'Release Bot', GIT_USER_EMAIL: 'release@acme.example' };

/**
 * Precedence: a configured identity outranks the environment (the var means "when there is nobody
 * else"), and an empty value counts as missing on both sides, because git treats it that way too.
 * `env` is always passed explicitly — otherwise a developer who exports GIT_USER_NAME fails the suite.
 */
const IDENTITY: Array<{
  name: string;
  config?: Record<string, string>;
  env?: Record<string, string>;
  userName: string;
  email: string;
}> = [
  { name: 'a fresh CI checkout has neither half', userName: DEFAULT_GIT_USER_NAME, email: DEFAULT_GIT_USER_EMAIL },
  {
    name: 'only the email is configured',
    config: { 'user.email': 'dev@example.com' },
    userName: DEFAULT_GIT_USER_NAME,
    email: 'dev@example.com',
  },
  {
    name: 'only the name is configured',
    config: { 'user.name': 'A Developer' },
    userName: 'A Developer',
    email: DEFAULT_GIT_USER_EMAIL,
  },
  { name: 'both are already configured', config: DEV, userName: 'A Developer', email: 'dev@example.com' },
  {
    name: 'the configured values are empty, which git reads as missing',
    config: { 'user.email': '', 'user.name': '' },
    userName: DEFAULT_GIT_USER_NAME,
    email: DEFAULT_GIT_USER_EMAIL,
  },
  {
    name: 'the env vars supply an identity git has none of',
    env: BOT_ENV,
    userName: 'Release Bot',
    email: 'release@acme.example',
  },
  {
    name: 'the env vars are IGNORED because git already has an identity — a local run is never rewritten',
    config: DEV,
    env: BOT_ENV,
    userName: 'A Developer',
    email: 'dev@example.com',
  },
  {
    name: 'only one env var is set, so each key resolves independently',
    env: { GIT_USER_NAME: 'Release Bot' },
    userName: 'Release Bot',
    email: DEFAULT_GIT_USER_EMAIL,
  },
  {
    name: 'an env var is set to empty, which falls back as if unset',
    env: { GIT_USER_NAME: '', GIT_USER_EMAIL: '' },
    userName: DEFAULT_GIT_USER_NAME,
    email: DEFAULT_GIT_USER_EMAIL,
  },
];

describe('resolveGitIdentity', () => {
  IDENTITY.forEach(({ name, config, env, userName, email }) => {
    it(`resolves the identity when ${name}`, async () => {
      expect(await resolveGitIdentity(fakeConfig(config), env ?? {})).to.deep.equal({ name: userName, email });
    });
  });

  // Pinning the literals (not the constants) makes cross-repo drift show up as a failing test.
  it('defaults to the identity the scaffolded workflows and the action both document', () => {
    expect(DEFAULT_GIT_USER_NAME).to.equal('bit-sync[bot]');
    expect(DEFAULT_GIT_USER_EMAIL).to.equal('bit-sync[bot]@users.noreply.github.com');
  });
});

// The identity rides on the invocation. A `git config user.*` write would outlive the run and
// re-author the developer's own later commits in that repository as the bot.
describe('commitWithIdentity', () => {
  function recorder(config?: Record<string, string>, env: Record<string, string> = {}) {
    const argv: string[][] = [];
    const run = async (args: string[]) => {
      argv.push(args);
      return '';
    };
    return { argv, deps: { run, io: fakeConfig(config), env } };
  }

  it('carries the identity as -c on the commit itself, and writes no config at all', async () => {
    const { argv, deps } = recorder();
    await commitWithIdentity('chore(bit-sync): sync git to latest main scope versions', deps);
    expect(argv).to.deep.equal([
      [
        '-c',
        `user.name=${DEFAULT_GIT_USER_NAME}`,
        '-c',
        `user.email=${DEFAULT_GIT_USER_EMAIL}`,
        'commit',
        '-m',
        'chore(bit-sync): sync git to latest main scope versions',
      ],
    ]);
    // no `config`/`addConfig` call of any shape — and GitConfigIO has no setter to make one with
    expect(argv.some((args) => args.includes('config') || args.includes('addConfig'))).to.equal(false);
  });

  it('honours a configured identity and appends the extra flags after the message', async () => {
    const { argv, deps } = recorder(DEV, BOT_ENV);
    await commitWithIdentity('chore(bit-sync): sync lane', { ...deps, extraArgs: ['--allow-empty'] });
    expect(argv).to.deep.equal([
      [
        '-c',
        'user.name=A Developer',
        '-c',
        'user.email=dev@example.com',
        'commit',
        '-m',
        'chore(bit-sync): sync lane',
        '--allow-empty',
      ],
    ]);
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

// A branch deletion is the one irreversible thing the reconciler does, and every input to it was read
// from refs fetched once per run — so the tip is re-read here, and leased on in the push itself.
describe('refetchBranchTip', () => {
  it('re-fetches exactly that one head, then reads the remote-tracking ref it just wrote', async () => {
    const argv: string[][] = [];
    const tip = await refetchBranchTip('my-lane', async (args) => {
      argv.push(args);
      return args[0] === 'rev-parse' ? 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1\n' : '';
    });
    expect(argv).to.deep.equal([
      ['fetch', 'origin', '+refs/heads/my-lane:refs/remotes/origin/my-lane'],
      ['rev-parse', 'refs/remotes/origin/my-lane'],
    ]);
    expect(tip).to.equal('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1');
    expect(singleHeadRefspec('my-lane')).to.equal('+refs/heads/my-lane:refs/remotes/origin/my-lane');
  });

  // A stale sha here would license deleting a commit that is no longer the tip; undefined keeps the branch.
  it('is undefined — never a stale sha — when the fetch fails, the ref is gone, or the output is empty', async () => {
    expect(
      await refetchBranchTip('my-lane', async (args) => {
        if (args[0] === 'fetch') throw new Error("couldn't find remote ref refs/heads/my-lane");
        return 'staaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaale';
      })
    ).to.equal(undefined);
    expect(await refetchBranchTip('my-lane', async () => '')).to.equal(undefined);
    expect(await refetchBranchTip('my-lane', async () => undefined)).to.equal(undefined);
  });
});

describe('deleteBranchArgs', () => {
  const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';

  it('leases the delete on the expected sha, keeping the full delete refspec', () => {
    expect(deleteBranchArgs('my-lane', SHA)).to.deep.equal([
      'origin',
      `--force-with-lease=refs/heads/my-lane:${SHA}`,
      ':refs/heads/my-lane',
    ]);
  });

  // A bare `--delete <branch>` or a short lease ref would let a branch name be read as an option.
  it('never passes the branch name as a bare argument', () => {
    expect(deleteBranchArgs('-hostile', SHA)).to.deep.equal([
      'origin',
      `--force-with-lease=refs/heads/-hostile:${SHA}`,
      ':refs/heads/-hostile',
    ]);
  });

  // Every refusal wording must read as a race. The third one is why this row exists: the local/file
  // transport says "incorrect old value provided", and matching only the first two reported a refused
  // delete as a failed one — caught by CI, whose e2e remotes use that transport.
  it('recognizes every lease-refusal wording, and not an unrelated push failure', () => {
    expect(isStaleLeaseRejection('! [rejected] (delete) -> my-lane (stale info)')).to.equal(true);
    expect(
      isStaleLeaseRejection(`remote: error: cannot lock ref 'refs/heads/my-lane': is at ${SHA} but expected abc123`)
    ).to.equal(true);
    expect(
      isStaleLeaseRejection('!\t:refs/heads/race-lane\t[remote rejected] (incorrect old value provided)')
    ).to.equal(true);
    expect(isStaleLeaseRejection('remote: GH006: Protected branch update failed')).to.equal(false);
  });
});

describe('isNonContentPath', () => {
  it('covers the two paths the executors never treat as workspace content, and nothing adjacent', () => {
    ['.bit', '.bit/objects/ab/cdef', 'node_modules/lodash/index.js'].forEach((p) =>
      expect(isNonContentPath(p), p).to.equal(true)
    );
    ['.bitmap', 'node_modules_backup/x'].forEach((p) => expect(isNonContentPath(p), p).to.equal(false));
  });
});

// Both paths must end with the same index: everything staged except `.bit` / `node_modules`. The
// fallback exists because `git add` refuses a pathspec naming an ignored path.
describe('addAllExceptScopeAndModules', () => {
  /** Records argv; `failFastPath` models git refusing the `:(exclude)` form (both trees gitignored). */
  function recorder(failFastPath = false) {
    const argv: string[][] = [];
    const run = async (args: string[]) => {
      argv.push(args);
      if (failFastPath && args.some((arg) => arg.startsWith(':(exclude)'))) {
        throw new Error('The following paths are ignored by one of your .gitignore files:\n.bit\nnode_modules');
      }
      return undefined;
    };
    return { argv, run };
  }

  it('excludes both trees by pathspec in one command, so git never traverses them', async () => {
    const { argv, run } = recorder();
    await addAllExceptScopeAndModules(run);
    expect(argv).to.deep.equal([['add', '-A', '--', '.', ':(exclude).bit', ':(exclude)node_modules']]);
  });

  it('falls back to add-then-reset when git refuses the pathspecs', async () => {
    const { argv, run } = recorder(true);
    await addAllExceptScopeAndModules(run);
    expect(argv).to.deep.equal([
      ['add', '-A', '--', '.', ':(exclude).bit', ':(exclude)node_modules'],
      ['add', '-A', '--', '.'],
      ['reset', '-q', '--', '.bit', 'node_modules'],
    ]);
  });

  // Either shape must cover every excluded path, or a new entry silently stops being excluded.
  it('names every excluded path on both paths', async () => {
    const fast = recorder();
    await addAllExceptScopeAndModules(fast.run);
    const fallback = recorder(true);
    await addAllExceptScopeAndModules(fallback.run);
    const reset = fallback.argv.find((args) => args[0] === 'reset') as string[];
    SYNC_EXCLUDED_PATHS.forEach((path) => {
      expect(fast.argv[0], path).to.include(`:(exclude)${path}`);
      expect(reset, path).to.include(path);
    });
    expect(reset.slice(3)).to.deep.equal(SYNC_EXCLUDED_PATHS);
  });
});

// A wrong default-branch name does not fail loudly — it protects the wrong branch. A slashed name is a
// NAME, not a path to shorten, and an unrecognised shape must yield undefined so the caller can fall back.
const ORIGIN_HEAD: Array<[string, string | undefined]> = [
  ['refs/remotes/origin/main\n', 'main'],
  ['refs/remotes/origin/master', 'master'],
  ['refs/remotes/origin/release/main', 'release/main'],
  ['refs/remotes/origin/team/x/main\n', 'team/x/main'],
  ['refs/remotes/origin/feature/a/b/c', 'feature/a/b/c'],
  ['refs/heads/main', undefined],
  ['fatal: ref refs/remotes/origin/HEAD is not a symbolic ref', undefined],
  ['', undefined],
  ['   ', undefined],
  ['refs/remotes/origin/', undefined],
];

describe('parseOriginHeadRef', () => {
  it('reads the branch name whole, or nothing at all', () => {
    ORIGIN_HEAD.forEach(([input, expected]) =>
      expect(parseOriginHeadRef(input), JSON.stringify(input)).to.equal(expected)
    );
  });
});

// These rows assert the ORDER of the three steps: a clean after the reload would leave the workspace
// holding a `.bitmap` view of a tree that no longer exists.
describe('checkoutPristine', () => {
  const CLEAN = 'clean -fd -e .bit -e node_modules';

  /** Records git argv and the reload interleaved, so ordering between the two is assertable. */
  function recorder(revParse = 'abc123\n', containedIn = '  origin/some-branch\n') {
    const steps: string[] = [];
    const run = async (args: string[]) => {
      steps.push(args.join(' '));
      // model the REAL runner: a missing ref resolves with empty output rather than rejecting
      if (args[0] === 'rev-parse') return revParse;
      if (args[0] === 'branch') return containedIn;
      return undefined;
    };
    const reload = async () => {
      steps.push('<reload>');
    };
    return { steps, run, reload };
  }

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

  it('without a startPoint: plain forced switch to an existing branch, then cleans, then reloads', async () => {
    const { steps, run, reload } = recorder();
    await checkoutPristine('main', undefined, reload, run);
    expect(steps).to.deep.equal(['checkout -f main', CLEAN, '<reload>']);
  });

  // `checkout -B` moves an existing local ref; unpushed commits would be orphaned to the reflog.
  it('REFUSES to reset a local branch whose commits no remote contains, before touching the tree', async () => {
    const { steps, run, reload } = recorder('abc123\n', '\n');
    let message = '';
    await checkoutPristine('my-lane', 'origin/my-lane', reload, run).catch((e) => {
      message = e.message;
    });
    expect(message).to.contain('local branch "my-lane" has commits that no remote branch contains');
    expect(steps.some((step) => step.startsWith('checkout'))).to.equal(false);
    expect(steps.some((step) => step.startsWith('clean'))).to.equal(false);
  });

  // Remote containment admits both legitimate reset shapes; start-point ancestry wrongly refuses one.
  it('allows the reset when any remote branch contains the local tip — even a different one than the start point', async () => {
    const { steps, run, reload } = recorder('abc123\n', '  origin/policy-lane\n');
    await checkoutPristine('policy-lane', 'origin/main', reload, run);
    expect(steps.some((step) => step === 'checkout -f -B policy-lane origin/main')).to.equal(true);
  });

  it('skips the safety proof when the branch does not exist locally (every CI clone)', async () => {
    const { steps, run, reload } = recorder('');
    await checkoutPristine('my-lane', 'origin/my-lane', reload, run);
    expect(steps.filter((step) => step.startsWith('branch -r'))).to.deep.equal([]);
    expect(steps.some((step) => step === 'checkout -f -B my-lane origin/my-lane')).to.equal(true);
  });
});

describe('parseLsRemoteSymref / remoteHeadBranch', () => {
  const SYMREF_OUT = 'ref: refs/heads/main\tHEAD\n1234abcd\tHEAD\n';

  it('reads the branch out of the symref line, keeping a slashed name whole', () => {
    expect(parseLsRemoteSymref(SYMREF_OUT)).to.equal('main');
    // same slash discipline as parseOriginHeadRef: `release/main` is a NAME, not a path to shorten
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

/**
 * The default branch is derived from the remote, not from validated config, so the primitive that
 * builds the checkout argv is the last line of defence against an option-like name.
 */
describe('assertCheckoutableBranch', () => {
  it('refuses a name git would read as an option, or reject as a ref, before any argv is built', () => {
    ['-x', '--force', '', 'has space', 'a..b', 'refs/heads/main', 'ends.lock'].forEach((name) => {
      expect(() => assertCheckoutableBranch(name), name).to.throw(/cannot check out/);
    });
  });

  it('accepts ordinary names, slashed names included', () => {
    ['main', 'master', 'release/main', 'feature/a-b_c', 'trunk'].forEach((name) => {
      expect(() => assertCheckoutableBranch(name), name).to.not.throw();
    });
  });

  it('is enforced by checkoutPristine itself, so every caller inherits it', async () => {
    const steps: string[] = [];
    let threw = false;
    await checkoutPristine(
      '-x',
      undefined,
      async () => {},
      async (args) => {
        steps.push(args.join(' '));
      }
    ).catch(() => {
      threw = true;
    });
    expect(threw).to.equal(true);
    expect(steps).to.deep.equal([]);
  });
});

describe('localBranchExists', () => {
  // simple-git's `raw` can resolve with empty output on non-zero exits, so all three missing-branch
  // runner behaviors (empty resolve, undefined resolve, rejection) must be false.
  it('asks for the LOCAL ref quietly, and is true only when that ref prints a sha', async () => {
    const argv: string[][] = [];
    expect(
      await localBranchExists('main', async (args) => {
        argv.push(args);
        return 'abc123\n';
      })
    ).to.equal(true);
    expect(argv).to.deep.equal([['rev-parse', '--verify', '--quiet', 'refs/heads/main']]);
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
