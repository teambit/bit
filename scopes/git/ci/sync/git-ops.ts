import { git } from '../git';

/**
 * Git primitives shared by the lane and main sync executors. They live here rather than being
 * duplicated per executor because each one encodes a decision that must stay identical on both
 * paths — a divergence between them is a bug, not a variation.
 */

/** paths the sync executors never treat as workspace content — see `cleanUntrackedScoped` */
export const SYNC_EXCLUDED_PATHS = ['.bit', 'node_modules'];

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
export async function cleanUntrackedScoped(): Promise<void> {
  await git.raw(['clean', '-fd', ...SYNC_EXCLUDED_PATHS.flatMap((path) => ['-e', path])]);
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
 * `git commit` fails outright when no identity is configured, which is the norm in a fresh CI
 * checkout. Only set one when the repo/environment doesn't already provide it, so an interactive
 * run keeps the developer's own identity.
 */
export async function ensureGitIdentity(): Promise<void> {
  const configured = await git
    .raw(['config', '--get', 'user.email'])
    .then((out) => out.trim().length > 0)
    .catch(() => false);
  if (configured) return;
  await git.addConfig('user.email', 'bit-ci[bot]@bit.cloud');
  await git.addConfig('user.name', 'Bit CI');
}
