import { git } from '../git';

/**
 * Git primitives shared by the lane and main sync executors. They live here rather than being
 * duplicated per executor because each one encodes a decision that must stay identical on both
 * paths — a divergence between them is a bug, not a variation.
 */

/** paths the sync executors never treat as workspace content — see `cleanUntrackedScoped` */
export const SYNC_EXCLUDED_PATHS = ['.bit', 'node_modules'];

/**
 * How a raw git invocation is run, injectable so a helper whose whole content is its argv can be unit
 * tested without a repository. Production always uses {@link realGitRaw}.
 */
export type GitArgsRunner = (args: string[]) => Promise<unknown>;

export const realGitRaw: GitArgsRunner = (args) => git.raw(args);

/**
 * Remove untracked files, leaving the local bit scope and installed packages alone.
 *
 * `-x` is deliberately NOT passed (so ignored files are untouched) **and** `.bit` / `node_modules`
 * are excluded explicitly. Without those exclusions the clean can delete the local bit scope: a
 * workspace whose scope lives at `<workspace>/.bit` (a pre-existing `.bit` directory, or a worktree
 * where `.git` is a file) and whose `.gitignore` lacks Bit's block would have `.bit/objects` and
 * `.bit/scope.json` removed mid-run.
 *
 * `git clean` runs in `process.cwd()` — `simpleGit()` is constructed with no `baseDir` (`../git.ts`) —
 * which for `bit ci sync` is the workspace root.
 */
export async function cleanUntrackedScoped(run: GitArgsRunner = realGitRaw): Promise<void> {
  await run(['clean', '-fd', ...SYNC_EXCLUDED_PATHS.flatMap((path) => ['-e', path])]);
}

/**
 * Put the working tree on `branch` holding **nothing but** that commit's content, and make the
 * workspace re-read the `.bitmap` the checkout brought with it.
 *
 * Three steps, and every executor that moves the working tree needs all three. They are here, in one
 * function, because they were previously copied per call site — and the copy that dropped the middle
 * step was a real defect (below), which is exactly the divergence this module exists to prevent.
 *
 * - **`checkout -f`** — the `-f` is not optional. Without it a single tracked modification left in the
 *   workspace (by an earlier target in the same `--all` run, by a warn-only `restoreWorkspace`, or by a
 *   developer running this interactively) makes git refuse with "local changes would be overwritten",
 *   and the target *aborts* instead of halting. Nothing is lost: `bit ci sync` announces up front that
 *   it discards uncommitted changes, and this is only ever a checkout — the executor never force-pushes.
 * - **`cleanUntrackedScoped`** — a forced checkout replaces tracked files but **leaves untracked ones
 *   in place**, and every commit path stages with `git add -A` (see `addAllExceptScopeAndModules`). So
 *   an untracked file that outlived a previous target — a lane that halted after materializing its
 *   components, a `restoreWorkspace` that warn-only failed — or a file a developer simply had lying
 *   around in a local run, gets staged by the *next* target and pushed onto that target's branch as
 *   part of a state that does not describe it. Scoped, so it can never delete the local bit scope.
 * - **the reload** — the checkout swaps `.bitmap` on disk, and until the workspace re-reads it every
 *   following bit operation resolves "current lane" and per-component versions against the checkout the
 *   process started on. It must run *after* the clean, so what it reads is the pristine tree.
 *
 * `startPoint` given creates-or-resets `branch` there (`-B`), which is how a sync branch is forked from
 * the default branch or reset to `origin/<branch>`; omitted, it is a plain switch to a branch that
 * already exists locally, which is how both restore paths get back to the default branch.
 *
 * **The `-B` is guarded.** `checkout -B` MOVES an existing local ref, and a local branch holding
 * commits no remote branch contains — a developer's unpushed work, in an interactive run — would be
 * orphaned to the reflog by that move. That exceeds the command's announced contract (discarding
 * *uncommitted* changes), so the reset is refused and the target halts instead: push the commits,
 * delete the local branch, or run from a clean clone. The predicate is remote containment, not
 * ancestry of the start point, because the reconciler moves branches in two legitimate shapes the
 * start point cannot distinguish: resetting a branch to its own `origin/<branch>` AND forking a
 * branch fresh from `origin/<defaultBranch>` over a stale local one — in both, a fully *pushed*
 * local tip loses nothing (its commits stay reachable through the remote-tracking ref). A CI clone
 * never hits the guard at all: the branch does not exist locally there.
 *
 * `reload` is passed in rather than imported because the workspace reload lives on the ci aspect, which
 * this module deliberately does not depend on.
 */
export async function checkoutPristine(
  branch: string,
  startPoint: string | undefined,
  reload: () => Promise<void>,
  run: GitArgsRunner = realGitRaw
): Promise<void> {
  if (startPoint && (await localBranchExists(branch, run))) {
    const containedIn = String((await run(['branch', '-r', '--contains', `refs/heads/${branch}`])) ?? '').trim();
    if (!containedIn) {
      throw new Error(
        `local branch "${branch}" has commits that no remote branch contains — resetting it would ` +
          `orphan them (recoverable only from the reflog). Push or back up the local branch, delete ` +
          `it, or run from a clean checkout`
      );
    }
  }
  await run(startPoint ? ['checkout', '-f', '-B', branch, startPoint] : ['checkout', '-f', branch]);
  await cleanUntrackedScoped(run);
  await reload();
}

/**
 * Whether `refs/heads/<branch>` exists — i.e. the branch exists *locally*, not just on a remote.
 *
 * Judged by OUTPUT (`rev-parse --verify` prints the sha or nothing), never by whether the call threw:
 * simple-git's `raw` resolves with empty output on some non-zero exits instead of rejecting, so an
 * exception-based check reports every missing branch as existing under the real runner while passing
 * against unit fakes that throw — the exact divergence that let a broken check through once already.
 */
export async function localBranchExists(branch: string, run: GitArgsRunner = realGitRaw): Promise<boolean> {
  const out = await run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).catch(() => '');
  return String(out ?? '').trim().length > 0;
}

/**
 * `checkoutPristine` for the two `restoreWorkspace` paths, which differ from every other checkout in
 * one way: whether a start point is safe depends on where the run is happening.
 *
 * - The local branch exists (a developer's repo, a full CI checkout): plain forced switch, **no**
 *   start point. Passing `origin/<branch>` here would `-B`-reset the developer's default branch to
 *   the remote's — silently discarding their unpushed local commits on it.
 * - The local branch does not exist (detached-HEAD or single-branch CI checkout of some other ref):
 *   fork it from `origin/<branch>`, which `fetchRemoteHeads` guarantees is present. There is no
 *   local state to preserve, and the plain switch would fail — caught as a warn-only error that
 *   strands the workspace on the last sync branch.
 */
export async function checkoutPristineRestore(
  branch: string,
  reload: () => Promise<void>,
  run: GitArgsRunner = realGitRaw
): Promise<void> {
  const startPoint = (await localBranchExists(branch, run)) ? undefined : `origin/${branch}`;
  await checkoutPristine(branch, startPoint, reload, run);
}

/**
 * Stage every change except the two paths `cleanUntrackedScoped` refuses to touch. Excluding them
 * matters because all three commit paths stage with `-A`: in a workspace whose `.gitignore` lacks
 * Bit's block, a bare `git add -A` would commit the entire local scope (`.bit/objects`) into the sync
 * branch. Nothing of value is lost — a tracked `.bit` is pathological, and every executor already
 * treats those two paths as "not workspace content".
 *
 * Why this is two commands rather than one `git add` with `:(exclude)` pathspecs: `git add` **exits
 * non-zero** ("The following paths are ignored by one of your .gitignore files … use -f") when *any*
 * pathspec element names a path that `.gitignore` ignores — and it applies that rule to negative
 * `:(exclude)` elements too. So `add -A -- . :(exclude).bit :(exclude)node_modules` staged the right
 * set but failed with exit 1 in the *normal* setup, where `.gitignore` carries Bit's block — breaking
 * every commit path of `bit ci sync` and of `bit ci merge` (see `commitAndPushBitmapChanges`).
 * Silencing it is not possible: `advice.addIgnoredFile=false` drops the hint but keeps the exit code,
 * and `--ignore-errors` does not cover it either. `-f` does make it exit 0, but it is **unsafe** — it
 * force-adds every *other* ignored path (`dist/`, `*.log`, …) into the sync commit, which is precisely
 * the class of accident the exclusions exist to prevent.
 *
 * Staging normally and then unstaging the two paths is equivalent and exits clean: `git add -A -- .`
 * already skips them when they are ignored, and the `reset` covers the workspace where they are not.
 * `git reset -- <paths>` is a no-op (exit 0) for paths absent from the index, including on an unborn
 * HEAD, so neither command can fail on a shape the sync engine can encounter.
 */
export async function addAllExceptScopeAndModules(): Promise<void> {
  await git.raw(['add', '-A', '--', '.']);
  await git.raw(['reset', '-q', '--', ...SYNC_EXCLUDED_PATHS]);
}

/**
 * Whether a `git status` path is one of the paths the sync executors never treat as workspace content.
 *
 * This is the single definition of that set, and it has to be applied everywhere a status is
 * *interpreted*, not just where files are written: in a workspace whose `.gitignore` lacks Bit's block,
 * `git status` lists every file under `.bit/` and `node_modules/` as untracked — tens of thousands of
 * them — and counting those as drift (or as "changes that will be discarded") is both wrong and
 * unreadable.
 */
export function isNonContentPath(path: string): boolean {
  return SYNC_EXCLUDED_PATHS.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

/**
 * The refspec every sync fetch passes **explicitly**, overriding whatever `remote.origin.fetch` this
 * checkout was configured with.
 */
export const ALL_HEADS_REFSPEC = '+refs/heads/*:refs/remotes/origin/*';

/**
 * Fetch `origin` so that **every** branch it has is available as `refs/remotes/origin/<branch>`.
 *
 * A bare `git fetch origin` honours the checkout's configured `remote.origin.fetch`. In a single-branch
 * clone — `git clone --single-branch`, `git remote set-branches`, a mirror, or an `actions/checkout`
 * configured to narrow the refspec — that config is `+refs/heads/<one>:refs/remotes/origin/<one>`, so the
 * fetch updates exactly one remote-tracking ref and silently leaves every other branch with none.
 *
 * That is a *silent* mismatch with how the reconciler enumerates work, which is what made it a bug rather
 * than an unsupported configuration. Enumeration goes through `ls-remote` (`listRemoteBranches`,
 * `branchExistsOnRemote`), which asks the remote directly and therefore **sees every branch** regardless of
 * refspec — deliberately, so a stale lane branch cannot go unnoticed. The reconciler then reads the branch
 * it was told exists through `refs/remotes/origin/<branch>`: `git log` for the state commit, `git show` for
 * the committed `.bitmap`, `checkout -f -B <branch> origin/<branch>` to materialize it. In a narrowed
 * checkout those refs do not exist, so a lane whose branch the run had just enumerated halted with a git
 * "unknown revision" error — on every run, for every lane but one.
 *
 * Passing the refspec on the command line is what fixes it: git ignores the configured refspec entirely
 * when one is given, so this is correct in a narrowed checkout and identical to the previous behaviour in
 * an ordinary one. The cost is the same as a normal full fetch — the objects behind those branches are
 * what a default clone would already have.
 *
 * **This does not make shallow clones work.** Depth is a different axis: `--depth` truncates history, and
 * the state model needs ancestry (`isAncestor`, merge-base, "the newest commit on the first-parent line
 * that changed `.bitmap`"). Fetching more *refs* cannot supply commits that were never transferred. See
 * the checkout-requirements section of `ci.docs.mdx`.
 */
export async function fetchRemoteHeads(run: GitArgsRunner = realGitRaw): Promise<void> {
  await run(['fetch', 'origin', ALL_HEADS_REFSPEC]);
}

/** Whether `origin` has the given branch. Assumes a `git fetch` isn't required (uses `ls-remote`). */
export async function branchExistsOnRemote(branch: string): Promise<boolean> {
  const out = await git.raw(['ls-remote', '--heads', 'origin', branch]);
  return out.trim().length > 0;
}

/**
 * Every branch `origin` has, by short name (`refs/heads/` stripped).
 *
 * `ls-remote` rather than `git branch -r`: it asks the remote directly, so the answer can't be narrowed
 * by this checkout's `remote.origin.fetch` refspec or by how recently it fetched — in a single-branch
 * clone `git branch -r` lists exactly one branch, which is precisely the case where a stale lane branch
 * would go unnoticed.
 */
export async function listRemoteBranches(): Promise<string[]> {
  const out = await git.raw(['ls-remote', '--heads', 'origin']);
  const prefix = 'refs/heads/';
  return out
    .split('\n')
    .map((line) => line.split('\t')[1]?.trim())
    .filter((ref): ref is string => Boolean(ref && ref.startsWith(prefix)))
    .map((ref) => ref.slice(prefix.length));
}

/**
 * Is `maybeAncestor` reachable from `descendant` — i.e. does `descendant`'s history already contain it?
 * True for identical commits too.
 *
 * Deliberately **not** `git merge-base --is-ancestor`, which reports its answer through the exit code
 * (0 = ancestor, 1 = not): simple-git's `raw` *resolves* rather than rejects on exit 1, so "not an
 * ancestor" would read as success and this would always answer yes. `isBranchBehindDefaultBranch` in
 * `ci.main.runtime.ts` documents the same trap, found the same way. Compute the merge base and compare
 * instead — `merge-base(A, B) === A` iff A is an ancestor of B.
 *
 * Throws when the two commits share no history at all (`merge-base` exits non-zero with no output) or a
 * revision cannot be resolved; callers decide what an unanswerable question means for them.
 */
export async function isAncestor(maybeAncestor: string, descendant: string): Promise<boolean> {
  const ancestorSha = (await git.revparse([maybeAncestor])).trim();
  const mergeBase = (await git.raw(['merge-base', maybeAncestor, descendant])).trim();
  if (!ancestorSha || !mergeBase) throw new Error(`could not compare ${maybeAncestor} against ${descendant}`);
  return ancestorSha === mergeBase;
}

/**
 * The prefix `git symbolic-ref refs/remotes/origin/HEAD` puts in front of the default branch name.
 */
export const ORIGIN_HEAD_REF_PREFIX = 'refs/remotes/origin/';

/**
 * The default branch name out of `git symbolic-ref refs/remotes/origin/HEAD` output, or undefined when the
 * output is not the shape we know.
 *
 * **Strips the prefix; never splits on `/`.** A branch name may legitimately contain slashes —
 * `release/main`, `team/x/main` — and the previous `split('/').pop()` reduced
 * `refs/remotes/origin/release/main` to `main`. That is not a cosmetic error: this value is what the sync
 * flow protects. It is the branch the reserved-branch guard refuses to let a lane write to, the ref every
 * `isAncestor` reachability test measures against, and the branch merged into a sync branch to keep it
 * mergeable — so a truncated name means the *wrong* branch is protected and a real default branch called
 * `release/main` is left unguarded while an unrelated `main` is treated as sacred.
 *
 * Returning undefined for an unrecognised shape (rather than guessing) hands the caller back to its
 * probing fallback, which is a worse answer but never a wrong-branch one.
 */
export function parseOriginHeadRef(symbolicRefOutput: string): string | undefined {
  const ref = symbolicRefOutput.trim();
  if (!ref.startsWith(ORIGIN_HEAD_REF_PREFIX)) return undefined;
  return ref.slice(ORIGIN_HEAD_REF_PREFIX.length) || undefined;
}

/** The prefix a symref answer from `git ls-remote --symref origin HEAD` puts before the branch name. */
const LS_REMOTE_SYMREF_PREFIX = 'ref: refs/heads/';

/**
 * The default branch name out of `git ls-remote --symref origin HEAD` output, or undefined when no
 * symref line is present (some servers, and all of them under protocol v0, omit it).
 *
 * Same slash discipline as {@link parseOriginHeadRef}: strip the fixed prefix, never `split('/')` —
 * `ref: refs/heads/release/main\tHEAD` names the branch `release/main`, whole.
 */
export function parseLsRemoteSymref(lsRemoteOutput: string): string | undefined {
  const line = lsRemoteOutput.split('\n').find((l) => l.startsWith(LS_REMOTE_SYMREF_PREFIX));
  if (!line) return undefined;
  const name = line.slice(LS_REMOTE_SYMREF_PREFIX.length).split('\t')[0].trim();
  return name || undefined;
}

/**
 * The remote's own answer for its default branch — `git ls-remote --symref origin HEAD` asks the server
 * for the branch HEAD points at. Unlike the local `refs/remotes/origin/HEAD` symref (unset in most CI
 * clones) or enumerating `origin/*` (narrowed by single-branch refspecs), this cannot be stale or
 * narrowed; it can only be unanswered (offline, or a server that omits the symref capability), in which
 * case undefined hands the caller on to its conventional-name fallback.
 */
export async function remoteHeadBranch(run: GitArgsRunner = realGitRaw): Promise<string | undefined> {
  try {
    const out = await run(['ls-remote', '--symref', 'origin', 'HEAD']);
    return parseLsRemoteSymref(String(out ?? ''));
  } catch {
    return undefined;
  }
}

/**
 * The absolute path of the git repository's root (its top-level working directory), or undefined when the
 * current directory is not inside a git repository.
 *
 * Needed because a bit workspace is not necessarily the repository root, and some things belong to the
 * repository rather than to the workspace — `.github/workflows` above all: GitHub only discovers workflows
 * at `<repo>/.github/workflows`, so a workspace in a subdirectory that scaffolds relative to itself
 * produces files that look right and never run.
 */
export async function gitRepoRoot(): Promise<string | undefined> {
  try {
    const root = (await git.raw(['rev-parse', '--show-toplevel'])).trim();
    return root || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The two `git config` operations `ensureGitIdentity` needs, injectable so the decision can be unit
 * tested without a git repository. Production always uses {@link realGitConfigIO}.
 */
export type GitConfigIO = {
  /** the configured value, or undefined when unset (or when git cannot answer) */
  get(key: string): Promise<string | undefined>;
  set(key: string, value: string): Promise<void>;
};

export const realGitConfigIO: GitConfigIO = {
  get: (key) =>
    git
      .raw(['config', '--get', key])
      .then((out) => (out.trim().length ? out.trim() : undefined))
      // A missing key exits non-zero; so does "not a git repository". Neither is an error here —
      // both mean "no identity to keep", which is what the caller acts on.
      .catch(() => undefined),
  set: async (key, value) => {
    await git.addConfig(key, value);
  },
};

/**
 * The identity the sync commits with when nothing else says otherwise.
 *
 * These two strings are a **contract**, not an implementation detail: the workflow templates
 * `bit ci sync --init` scaffolds document them verbatim as the defaults behind `GIT_USER_NAME` /
 * `GIT_USER_EMAIL` (`init-scaffold.ts`), and the GitHub Action applies the same pair before it invokes
 * `bit` (`action.ts`'s `DEFAULT_GIT_USER_NAME` / `DEFAULT_GIT_USER_EMAIL`). All three have to agree, or
 * the same repository produces commits under two different authors depending on which entry point ran —
 * and `git log --author` stops being a way to find the sync's own commits.
 */
export const DEFAULT_GIT_USER_NAME = 'bit-sync[bot]';
export const DEFAULT_GIT_USER_EMAIL = 'bit-sync[bot]@users.noreply.github.com';

/**
 * `git commit` fails outright when no identity is configured, which is the norm in a fresh CI
 * checkout. Only set what is missing, so an interactive run keeps the developer's own identity.
 *
 * **Both halves are checked independently, because git requires both.** Testing `user.email` alone and
 * returning early on it is not a shortcut, it is a bug: a checkout with an email but no name — a
 * half-configured global config, a container that sets only `EMAIL`, a `.gitconfig` with `[user] email`
 * and nothing else — passed the check and then failed at `git commit` with
 * `*** Please tell me who you are`, aborting the sync of every lane in the run. The two keys are also
 * set independently rather than as a pair, so the developer's own name survives a missing email and
 * vice versa.
 *
 * **`GIT_USER_NAME` / `GIT_USER_EMAIL` are honoured**, because the scaffolded workflows advertise them.
 * They were read only by the GitHub Action, which does its own `git config` before invoking `bit` — so
 * the mechanism worked on exactly one of the entry points that document it, and a standalone
 * `bit ci sync` (a from-source rig, GitLab CI, Jenkins, a local run) ignored a variable the user had been
 * told to set. Nothing announced that; the commits simply carried the wrong author.
 *
 * The precedence is **configured git identity > env var > default**, in that order. An existing
 * `user.email` still wins over `GIT_USER_EMAIL`: the env var says "commit as this when there is nobody
 * else", not "commit as this instead of whoever is configured", and inverting that would make a
 * developer's local run rewrite its own identity from an exported variable. Each key resolves
 * independently, so `GIT_USER_NAME` alone is a coherent thing to set.
 */
export async function ensureGitIdentity(
  io: GitConfigIO = realGitConfigIO,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (!(await io.get('user.email'))) await io.set('user.email', env.GIT_USER_EMAIL || DEFAULT_GIT_USER_EMAIL);
  if (!(await io.get('user.name'))) await io.set('user.name', env.GIT_USER_NAME || DEFAULT_GIT_USER_NAME);
}
