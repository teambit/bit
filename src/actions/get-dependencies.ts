// @flow
import { getDependencyTree } from '../dependency-builder';

export default (async function getDependenciesAction(baseDir, file, bindingPrefix, resolveConfig): Promise<any> {
  const consumerPath = process.cwd();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return getDependencyTree({
    baseDir,
    consumerPath,
    filePaths: [file],
    bindingPrefix,
    resolveModulesConfig: resolveConfig
  });
});
