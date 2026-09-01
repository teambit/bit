import * as fs from 'fs-extra';
import * as path from 'path';
import { BIT_GIT_DIR, BIT_HIDDEN_DIR, DOT_GIT_DIR, OBJECTS_DIR } from '@teambit/legacy.constants';

/**
 * search for a scope path by walking up parent directories until reaching root.
 * @param fromPath (e.g. /tmp/workspace)
 * @returns absolute scope-path if found (e.g. /tmp/workspace/.bit or /tmp/workspace/.git/bit).
 * in a git worktree/submodule (where ".git" is a pointer file, not a directory) the scope is a
 * standalone ".bit" inside the workspace, same as a non-git workspace.
 */
export function findScopePath(fromPath: string): string | undefined {
  if (!fromPath) return undefined;
  if (!fs.existsSync(fromPath)) return undefined;
  let currentPath = path.resolve(fromPath);
  for (;;) {
    // 1) bare scope: <dir>/objects
    if (isDir(path.join(currentPath, OBJECTS_DIR))) {
      // ".git/objects" is git's own object store, not a bit scope. it's reachable when walking up from
      // a scope-path whose "objects" dir was deleted (e.g. ".git/bit"). keep the legacy behavior of bailing out.
      if (path.basename(currentPath) === DOT_GIT_DIR) return undefined;
      return currentPath;
    }
    // 2) workspace scope: <dir>/.bit/objects (also where a git worktree/submodule keeps its scope)
    if (isDir(path.join(currentPath, BIT_HIDDEN_DIR, OBJECTS_DIR))) return path.join(currentPath, BIT_HIDDEN_DIR);
    // 3) git-embedded scope (standard checkout only): <dir>/.git/bit/objects
    const gitEmbeddedScope = path.join(currentPath, DOT_GIT_DIR, BIT_GIT_DIR);
    if (isDir(path.join(gitEmbeddedScope, OBJECTS_DIR))) return gitEmbeddedScope;
    // 4) a worktree/submodule root (".git" is a pointer file) with no scope yet is a hard boundary.
    // its scope belongs at its own ".bit" (created on init/auto-init) — walking further up could
    // pick up an unrelated outer repo's scope (and e.g. "bit init --reset-scope" would then wipe it).
    if (isFile(path.join(currentPath, DOT_GIT_DIR))) return undefined;
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) return undefined; // reached the filesystem root
    currentPath = parentPath;
  }
}

function isDir(dirPath: string): boolean {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
