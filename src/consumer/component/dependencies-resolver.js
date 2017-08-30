/** @flow */
import path from 'path';
import R from 'ramda';
import { DEFAULT_INDEX_NAME, DEFAULT_INDEX_TS_NAME } from '../../constants';
import BitMap from '../bit-map/bit-map';
import type { ComponentMap } from '../bit-map/bit-map';
import { BitId } from '../../bit-id';
import Component from '../component';
import { Driver } from '../../driver';

/**
 * Run over the deps tree recursively to build the full deps tree for component
 * @param {Object} tree - which contain direct deps for each file
 * @param files
 * @param {string} entryComponentId - component id for the entry of traversing - used to know which of the files are part of that component
 * @param {BitMap} bitMap
 * @param {string} consumerPath
 */
function traverseDepsTree(tree: Object, files: string[], entryComponentId: string, bitMap: BitMap, consumerPath: string): Object {
  const packagesDeps = {};
  const componentsDeps = [];
  const missingDeps = [];

  const entryComponentMap = bitMap.getComponent(entryComponentId);

  files.forEach((file) => {
    const allFilesDeps = tree[file].files;
    if (!allFilesDeps || R.isEmpty(allFilesDeps)) {
      return;
    }
    allFilesDeps.forEach((fileDep) => {
      const rootDir = entryComponentMap.rootDir;
      // Change the dependencies files to be relative to current consumer
      // We are not just using path.resolve(rootDir, fileDep) because this might not work when running
      // bit commands not from root, because resolve take by default the process.cwd
      if (rootDir) {
        const rootDirFullPath = path.join(consumerPath, rootDir);
        const fullFileDep = path.resolve(rootDirFullPath, fileDep);
        const relativeToConsumerFileDep = path.relative(consumerPath, fullFileDep);
        if (!relativeToConsumerFileDep.startsWith(rootDir)) fileDep = relativeToConsumerFileDep;
      }
      let destination;
      let componentId = bitMap.getComponentIdByPath(fileDep);
      if (!componentId) {
        // Check if its a generated index file
        if (path.basename(fileDep) === DEFAULT_INDEX_NAME || path.basename(fileDep) === DEFAULT_INDEX_TS_NAME) {
          const indexDir = path.dirname(fileDep);
          componentId = bitMap.getComponentIdByRootPath(indexDir);
          // Refer to the main file in case the source component required the index of the imported
          if (componentId) destination = bitMap.getMainFileOfComponent(componentId);
        }

        if (!componentId) {
          missingDeps.push(fileDep);
          return;
        }
      }
      if (componentId === entryComponentId) {
        const currentPackagesDeps = tree[file].packages;
        if (currentPackagesDeps && !R.isEmpty(currentPackagesDeps)) {
          Object.assign(packagesDeps, currentPackagesDeps);
        }
        return;
      }
      if (!destination) {
        const depRootDir = bitMap.getRootDirOfComponent(componentId);
        destination = depRootDir && fileDep.startsWith(depRootDir) ? path.relative(depRootDir, fileDep) : fileDep;
      }

      const depsPaths = { sourceRelativePath: fileDep, destinationRelativePath: destination };
      const currentComponentsDeps = { [componentId]: [depsPaths] };

      if (componentsDeps[componentId]) {
        componentsDeps[componentId].push(depsPaths);
      } else {
        Object.assign(componentsDeps, currentComponentsDeps);
      }
    });
  });
  return { componentsDeps, packagesDeps, missingDeps };
}

function mergeDependencyTrees(depTrees) {
  const dependencyTree = {
    missing: { packages: [], files: [] },
    tree: {}
  };
  Object.keys(depTrees).forEach(dep => {
    if (depTrees[dep].missing.packages.length) dependencyTree.missing.packages.push(...depTrees[dep].missing.packages);
    if (depTrees[dep].missing.files && depTrees[dep].missing.files.length) dependencyTree.missing.files.push(...depTrees[dep].missing.files);
    Object.assign(dependencyTree.tree, depTrees[dep].tree);
  });
  dependencyTree.missing.packages = R.uniq(dependencyTree.missing.packages);
  dependencyTree.missing.files = R.uniq(dependencyTree.missing.files);
  return dependencyTree;
}

export default async function loadDependenciesForComponent(component: Component,
                                                           componentMap: ComponentMap,
                                                           bitDir: string,
                                                           driver: Driver,
                                                           bitMap: BitMap,
                                                           consumerPath: string,
                                                           idWithConcreteVersionString: string) {
  component.missingDependencies = {};
  // find the dependencies (internal files and packages) through automatic dependency resolution
  const files = componentMap.files.map(file => file.relativePath);
  const treesP = files.map(file => driver.getDependencyTree(bitDir, consumerPath, file));
  const trees = await Promise.all(treesP);
  const dependenciesTree = trees.length === 1 ? R.head(trees) : mergeDependencyTrees(trees);
  if (dependenciesTree.missing.files && !R.isEmpty(dependenciesTree.missing.files)) {
    component.missingDependencies.missingDependenciesOnFs = dependenciesTree.missing.files;
  }
  if (dependenciesTree.missing.packages && !R.isEmpty(dependenciesTree.missing.packages)) {
    component.missingDependencies.missingPackagesDependenciesOnFs = dependenciesTree.missing.packages;
  }
  // we have the files dependencies, these files should be components that are registered in bit.map. Otherwise,
  // they are referred as "missing/untracked components" and the user should add them later on in order to commit
  const traversedDeps = traverseDepsTree(dependenciesTree.tree, files, idWithConcreteVersionString, bitMap, consumerPath);
  const traversedCompDeps = traversedDeps.componentsDeps;
  component.dependencies = Object.keys(traversedCompDeps).map((depId) => {
    return { id: BitId.parse(depId), relativePaths: traversedCompDeps[depId] };
  });
  const missingDependencies = traversedDeps.missingDeps;
  if (!R.isEmpty(missingDependencies)) component.missingDependencies.untrackedDependencies = missingDependencies;
  component.packageDependencies = traversedDeps.packagesDeps;

  return component;
}
