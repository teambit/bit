import findUp from 'find-up';
import * as fs from 'fs-extra';
import * as path from 'path';
import { BIT_GIT_DIR, BIT_HIDDEN_DIR, DOT_GIT_DIR, OBJECTS_DIR } from '@teambit/legacy.constants';

/**
 * search for a scope path by walking up parent directories until reaching root.
 * @param fromPath (e.g. /tmp/workspace)
 * @returns absolute scope-path if found (e.g. /tmp/workspace/.bit or /tmp/workspace/.git/bit)
 */
export function findScopePath(fromPath: string): string | undefined {
  if (!fromPath) return undefined;
  if (!fs.existsSync(fromPath)) return undefined;
  const filePath = findUp.sync(
    [
      OBJECTS_DIR, // for bare-scope
      path.join(BIT_HIDDEN_DIR, OBJECTS_DIR),
      path.join(DOT_GIT_DIR, BIT_GIT_DIR, OBJECTS_DIR),
    ],
    { cwd: fromPath, type: 'directory' }
  );
  if (!filePath) return undefined;
  if (filePath.endsWith(path.join('.git', 'objects'))) {
    return undefined; // happens when "objects" dir is deleted from the scope
  }
  return path.dirname(filePath);
}
