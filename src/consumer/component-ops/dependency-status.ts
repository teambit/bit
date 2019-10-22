import { Consumer } from '..';
import { DEFAULT_BINDINGS_PREFIX } from '../../constants';

export type DependencyStatusResult = { missingFiles: string[] };
export type DependencyStatusProps = { mainFile: string[] };

async function getTopLevelDependencies(consumer: Consumer, dependencyStatusProps: DependencyStatusProps) {
  const driver = consumer.driver.getDriver(false);
  const paths = dependencyStatusProps.mainFile;
  const consumerPath = consumer.getPath();
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  const tree = await driver.getDependencyTree({
    baseDir: consumerPath,
    consumerPath,
    filePaths: paths,
    bindingPrefix: DEFAULT_BINDINGS_PREFIX,
    resolveModulesConfig: consumer.config.resolveModules
  });
  const topLevelDependencies = Object.keys(tree.tree).map(topLevelFile => topLevelFile);
  return topLevelDependencies;
}

function getComponentFiles(consumer: Consumer) {
  const bitmap = consumer.bitMap;
  const componentsMaps = bitmap.getAllComponents();
  let componentFile = [];
  const values = Object.keys(componentsMaps).map(key => componentsMaps[key]);
  values.forEach(function(value) {
    if (value && value.files && Array.isArray(value.files)) {
      const currentFiles = [];
      value.files.forEach(function(file) {
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
  topLevelDependencies.forEach(function(dependency) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!componentFiles.includes(dependency)) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      missingDependencyFiles.push(dependency);
    }
  });

  const results: DependencyStatusResult = { missingFiles: missingDependencyFiles };
  return results;
});
