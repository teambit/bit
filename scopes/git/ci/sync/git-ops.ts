import { BitError } from '@teambit/bit-error';
import { git } from '../git';
import { validateBranchName } from './sync-config';

/**
 * Git primitives shared by the lane and main sync executors; each encodes a decision that must stay
 * identical on both paths.
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
 * Remove untracked files, leaving the local bit scope and installed packages alone. No `-x` (ignored
 * files stay), and `.bit` / `node_modules` are excluded explicitly — without that, the clean deletes
 * the local scope in a workspace whose `.gitignore` lacks Bit's block.
 */
export async function cleanUntrackedScoped(run: GitArgsRunner = realGitRaw): Promise<void> {
  await run(['clean', '-fd', ...SYNC_EXCLUDED_PATHS.flatMap((path) => ['-e', path])]);
}

/**
 * Refuse a branch name git would read as an option or reject as a ref. Not every branch reaching the
 * checkout comes from validated config: the default branch is derived from the remote
 * (`getDefaultBranchName`), so the primitive that builds the argv is where the guard belongs — every
 * caller inherits it.
 */
export function assertCheckoutableBranch(branch: string): void {
  const problem = validateBranchName(branch);
  if (problem) {
    throw new BitError(
      `bit ci sync cannot check out "${branch}": ${problem}. Rename the branch, or set the intended name ` +
        `explicitly in the "teambit.git/ci" sync config.`
    );
  }
}

/**
 * Put the working tree on `branch` holding nothing but that commit's content, then make the workspace
 * re-read the checked-out `.bitmap`. Order matters: `checkout -f` (leftover tracked changes must not
 * abort the target), then the scoped clean (a forced checkout leaves untracked files in place, and
 * every commit path stages with `-A`), then the reload so it reads the pristine tree. With
 * `startPoint`, `-B` creates-or-resets the branch — refused when the local branch holds commits no
 * remote contains, because moving it would orphan unpushed work; the predicate is remote containment,
 * not start-point ancestry (a fully pushed tip loses nothing in either legitimate reset shape).
 */
export async function checkoutPristine(
  branch: string,
  startPoint: string | undefined,
  reload: () => Promise<void>,
  run: GitArgsRunner = realGitRaw
): Promise<void> {
  assertCheckoutableBranch(branch);
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
 * Whether the branch exists locally. Judged by output, never by whether the call threw: simple-git's
 * `raw` resolves with empty output on some non-zero exits instead of rejecting.
 */
export async function localBranchExists(branch: string, run: GitArgsRunner = realGitRaw): Promise<boolean> {
  const out = await run(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).catch(() => '');
  return String(out ?? '').trim().length > 0;
}

/**
 * `checkoutPristine` for the restore paths: a start point only when the branch is absent locally
 * (detached-HEAD/single-branch checkouts) — passing `origin/<branch>` when it exists would `-B`-reset
 * the developer's default branch and discard their unpushed commits.
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
 * Stage every change except `.bit` / `node_modules` (a bare `add -A` would commit the local scope when
 * `.gitignore` lacks Bit's block). The `:(exclude)` pathspecs make git skip those trees instead of
 * staging them for a reset to undo; `git add` refuses them when a named path IS ignored — the case where
 * the traversal is already cheap — so the add-then-reset pair is the fallback. Both leave the same index,
 * and `git reset -- <paths>` is a no-op for paths absent from it, so neither fallback command can fail.
 */
export async function addAllExceptScopeAndModules(run: GitArgsRunner = realGitRaw): Promise<void> {
  const stageAll = ['add', '-A', '--', '.'];
  try {
    await run([...stageAll, ...SYNC_EXCLUDED_PATHS.map((path) => `:(exclude)${path}`)]);
  } catch {
    await run(stageAll);
    await run(['reset', '-q', '--', ...SYNC_EXCLUDED_PATHS]);
  }
}

/**
 * Whether a `git status` path is one the sync executors never treat as workspace content. Applied
 * everywhere a status is interpreted — otherwise `.bit`/`node_modules` files count as drift when
 * `.gitignore` lacks Bit's block.
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
 * Fetch `origin` so every branch it has is available as `refs/remotes/origin/<branch>`. A bare fetch
 * honours the checkout's configured `remote.origin.fetch`, which in a single-branch clone updates
 * exactly one ref while enumeration (`ls-remote`) sees every branch; an explicit refspec overrides the
 * config. Does not make shallow clones work — depth is a different axis.
 */
export async function fetchRemoteHeads(run: GitArgsRunner = realGitRaw): Promise<void> {
  await run(['fetch', 'origin', ALL_HEADS_REFSPEC]);
}

/** Refspec that updates exactly one remote-tracking ref — a mid-run re-read of a single branch. */
export function singleHeadRefspec(branch: string): string {
  return `+refs/heads/${branch}:refs/remotes/origin/${branch}`;
}

/**
 * `origin/<branch>`'s tip as the remote has it NOW: every other ref a run reads comes from one fetch at
 * its start. Undefined when the branch is gone or unreadable — never a stale sha, because the answer
 * decides whether a branch deletion is still safe.
 */
export async function refetchBranchTip(branch: string, run: GitArgsRunner = realGitRaw): Promise<string | undefined> {
  try {
    await run(['fetch', 'origin', singleHeadRefspec(branch)]);
    const out = await run(['rev-parse', `refs/remotes/origin/${branch}`]);
    return String(out ?? '').trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * `git push` argv that deletes a remote branch only while its tip is still `expectedTipSha`. Full
 * `:refs/heads/<b>` refspec so the branch name can never be read as an option; the lease makes the server
 * itself refuse a racing update rather than lose it.
 */
export function deleteBranchArgs(branch: string, expectedTipSha: string): string[] {
  return ['origin', `--force-with-lease=refs/heads/${branch}:${expectedTipSha}`, `:refs/heads/${branch}`];
}

/**
 * Whether a failed push was the lease refusing. The wording varies by git version and transport:
 * "stale info" (client-side check), "is at X but expected Y" (receive-pack), and "incorrect old value
 * provided" (the local/file transport, which is what CI's e2e remotes use). Over-matching is the safe
 * direction — the only consequence is reporting a branch as kept rather than as a failed delete.
 */
export function isStaleLeaseRejection(message: string): boolean {
  return /stale info|force-with-lease|but expected|incorrect old value/i.test(message);
}

/** Whether `origin` has the given branch. Assumes a `git fetch` isn't required (uses `ls-remote`). */
export async function branchExistsOnRemote(branch: string): Promise<boolean> {
  const out = await git.raw(['ls-remote', '--heads', 'origin', branch]);
  return out.trim().length > 0;
}

/**
 * Every branch `origin` has, by short name. `ls-remote` rather than `git branch -r` so the answer
 * cannot be narrowed by the checkout's refspec or staleness.
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
 * Is `maybeAncestor` reachable from `descendant` (true for identical commits)? Not `merge-base
 * --is-ancestor`: it answers via the exit code, and simple-git's `raw` resolves on exit 1, so "not an
 * ancestor" would read as yes. Throws when the commits share no history or a revision cannot resolve.
 */
export async function isAncestor(maybeAncestor: string, descendant: string): Promise<boolean> {
  const ancestorSha = (await git.revparse([maybeAncestor])).trim();
  const mergeBase = (await git.raw(['merge-base', maybeAncestor, descendant])).trim();
  if (!ancestorSha || !mergeBase) throw new Error(`could not compare ${maybeAncestor} against ${descendant}`);
  return ancestorSha === mergeBase;
}

/** The prefix `git symbolic-ref refs/remotes/origin/HEAD` puts in front of the default branch name. */
export const ORIGIN_HEAD_REF_PREFIX = 'refs/remotes/origin/';

/**
 * The default branch name out of `git symbolic-ref refs/remotes/origin/HEAD` output, or undefined for
 * an unrecognised shape. Strips the prefix; never splits on `/` — branch names may contain slashes
 * (`release/main`), and truncating would protect the wrong branch.
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
 * symref line is present (some servers omit it). Same slash discipline as {@link parseOriginHeadRef}.
 */
export function parseLsRemoteSymref(lsRemoteOutput: string): string | undefined {
  const line = lsRemoteOutput.split('\n').find((l) => l.startsWith(LS_REMOTE_SYMREF_PREFIX));
  if (!line) return undefined;
  const name = line.slice(LS_REMOTE_SYMREF_PREFIX.length).split('\t')[0].trim();
  return name || undefined;
}

/**
 * The remote's own answer for its default branch. Unlike the local `origin/HEAD` symref or enumerating
 * `origin/*`, this cannot be stale or narrowed — only unanswered (undefined hands on to the fallback).
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
 * The git repository's root, or undefined outside a repo. A bit workspace is not necessarily the repo
 * root, and GitHub only discovers workflows at `<repo>/.github/workflows`.
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
 * Reading `git config`, injectable so the identity decision can be unit tested without a repository.
 * There is deliberately no writer — see {@link resolveGitIdentity}.
 */
export type GitConfigIO = {
  /** the configured value, or undefined when unset (or when git cannot answer) */
  get(key: string): Promise<string | undefined>;
};

export const realGitConfigIO: GitConfigIO = {
  get: (key) =>
    git
      .raw(['config', '--get', key])
      .then((out) => (out.trim().length ? out.trim() : undefined))
      // A missing key and "not a git repository" both exit non-zero; both mean "no identity to keep".
      .catch(() => undefined),
};

/**
 * The identity the sync commits with when nothing else says otherwise. A contract: the scaffolded
 * workflow templates (`init-scaffold.ts`) and the GitHub Action's defaults must carry the same pair,
 * or the same repository commits under different authors depending on entry point.
 */
export const DEFAULT_GIT_USER_NAME = 'bit-sync[bot]';
export const DEFAULT_GIT_USER_EMAIL = 'bit-sync[bot]@users.noreply.github.com';

export type GitIdentity = { name: string; email: string };

/**
 * Who the sync commits as. Read-only on purpose: writing these keys into the repository's config
 * would outlive the run and re-author the developer's own later commits as the bot. Precedence per
 * key: configured git identity > `GIT_USER_NAME`/`GIT_USER_EMAIL` > default.
 */
export async function resolveGitIdentity(
  io: GitConfigIO = realGitConfigIO,
  env: NodeJS.ProcessEnv = process.env
): Promise<GitIdentity> {
  return {
    name: (await io.get('user.name')) || env.GIT_USER_NAME || DEFAULT_GIT_USER_NAME,
    email: (await io.get('user.email')) || env.GIT_USER_EMAIL || DEFAULT_GIT_USER_EMAIL,
  };
}

/** The `git -c` pair that applies an identity to ONE invocation, leaving the repo's config alone. */
export function identityArgs(identity: GitIdentity): string[] {
  return ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`];
}

export type IdentityDeps = { run?: GitArgsRunner; io?: GitConfigIO; env?: NodeJS.ProcessEnv };

/**
 * Run a git command that may author a commit. Every such command needs the identity — a fresh CI
 * checkout has none, and git refuses to commit ("Please tell me who you are") without one.
 */
export async function gitWithIdentity(args: string[], deps: IdentityDeps = {}): Promise<string> {
  const { run = realGitRaw, io = realGitConfigIO, env = process.env } = deps;
  const identity = await resolveGitIdentity(io, env);
  return String((await run([...identityArgs(identity), ...args])) ?? '');
}

/** `git commit` under the sync identity; `extraArgs` carries flags such as `--allow-empty`. */
export async function commitWithIdentity(
  message: string,
  opts: IdentityDeps & { extraArgs?: string[] } = {}
): Promise<void> {
  const { extraArgs = [], ...deps } = opts;
  await gitWithIdentity(['commit', '-m', message, ...extraArgs], deps);
}
