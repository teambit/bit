// @flow
import { getDependencyTree } from '../dependency-builder';

export default async function getDependenciesAction(baseDir, file, bindingPrefix, resolveConfig): Promise<any> {
  const consumerPath = process.cwd();
  return getDependencyTree({ baseDir, consumerPath, filePaths: [file], bindingPrefix, resolveModulesConfig: resolveConfig });
}
