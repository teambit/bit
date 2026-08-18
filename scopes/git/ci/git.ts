import { simpleGit } from 'simple-git';

/**
 * The shared git client for the `bit ci` commands. No `baseDir` is passed, so every command runs in
 * `process.cwd()` — the workspace root for a `bit ci` invocation.
 *
 * Do NOT chain a task onto this (as in the previous `simpleGit().clean(CleanOptions.FORCE)`):
 * simple-git's task methods queue and *run* their command, and the chainable they return only looks
 * like configuration. That form executed `git clean -f` in `process.cwd()` at module-import time — on
 * any bit command that loaded this aspect — silently deleting untracked files. Verified empirically
 * before removal. Cleaning is done deliberately, and scoped, in `sync/git-ops.ts`.
 */
export const git = simpleGit();
