// @flow
import { getDependencyTree } from '../dependency-builder';

export default async function getDependenciesAction(baseDir, file, bindingPrefix): Promise<any> {
  const consumerPath = process.cwd();
  return getDependencyTree(baseDir, consumerPath, [file], bindingPrefix);
}
