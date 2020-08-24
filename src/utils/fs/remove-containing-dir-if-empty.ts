import * as path from 'path';

import removeEmptyDir from './remove-empty-dir';

export default (async function removeContainingDirIfEmpty(componentDir: string): Promise<boolean> {
  const containingDir = path.dirname(componentDir);
  return removeEmptyDir(containingDir);
});
