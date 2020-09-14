import { Consumer } from '..';
import { DEFAULT_BINDINGS_PREFIX } from '../../constants';
import { getDependencyTree } from '../component/dependencies/files-dependency-builder';

export type DependencyStatusResult = { missingFiles: string[] };
export type DependencyStatusProps = { mainFile: string[] };

async function getTopLevelDependencies(consumer: Consumer, dependencyStatusProps: DependencyStatusProps) {
  const paths = dependencyStatusProps.mainFile;
  const consumerPath = consumer.getPath();
  const tree = await getDependencyTree({
    componentDir: consumerPath,
    workspacePath: consumerPath,
    filePaths: paths,
    bindingPrefix: DEFAULT_BINDINGS_PREFIX,
    isLegacyProject: consumer.isLegacy,
    resolveModulesConfig: consumer.config._resolveModules,
  });
  const topLevelDependencies = Object.keys(tree.tree).map((topLevelFile) => topLevelFile);
  return topLevelDependencies;
}

function getComponentFiles(consumer: Consumer) {
  const bitmap = consumer.bitMap;
  const componentsMaps = bitmap.getAllComponents();
  let componentFile = [];
  componentsMaps.forEach(function (componentMap) {
    if (componentMap.files && Array.isArray(componentMap.files)) {
      const currentFiles = [];
      componentMap.files.forEach(function (file) {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        if (file && file.relativePath) currentFiles.push(file.relativePath);
      });
      componentFile = componentFile.concat(currentFiles);
    }
  });
  return componentFile;
}

export default (async function getDependencyStatus(
  consumer: Consumer,
  dependencyStatusProps: DependencyStatusProps
): Promise<DependencyStatusResult> {
  const topLevelDependencies = await getTopLevelDependencies(consumer, dependencyStatusProps);
  const componentFiles = getComponentFiles(consumer);
  const missingDependencyFiles = [];
  topLevelDependencies.forEach(function (dependency) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!componentFiles.includes(dependency)) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      missingDependencyFiles.push(dependency);
    }
  });

  const results: DependencyStatusResult = { missingFiles: missingDependencyFiles };
  return results;
});
