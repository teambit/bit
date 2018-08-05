// @flow
import path from 'path';
import { removeEmptyDir } from '..';

export default (async function removeContainingDirIfEmpty(componentDir: string): Promise<boolean> {
  const containingDir = path.dirname(componentDir);
  return removeEmptyDir(containingDir);
});
