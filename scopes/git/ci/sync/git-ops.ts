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
 * Stage every change except the two paths `cleanUntrackedScoped` refuses to touch. The pathspec
 * exclusions matter because both sync paths stage with `-A`: in a workspace whose `.gitignore` lacks
 * Bit's block, a bare `git add -A` would commit the entire local scope (`.bit/objects`) into the sync
 * branch. Nothing of value is lost — a tracked `.bit` is pathological, and both executors already
 * treat those two paths as "not workspace content".
 */
export async function addAllExceptScopeAndModules(): Promise<void> {
  await git.raw(['add', '-A', '--', '.', ...SYNC_EXCLUDED_PATHS.map((path) => `:(exclude)${path}`)]);
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
