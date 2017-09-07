/** @flow */
import path from 'path';
import R from 'ramda';
import { DEFAULT_INDEX_NAME, DEFAULT_INDEX_TS_NAME } from '../../constants';
import BitMap from '../bit-map/bit-map';
import type { ComponentMapFile } from '../bit-map/component-map';
import ComponentMap from '../bit-map/component-map';
import { BitId } from '../../bit-id';
import Component from '../component';
import { Driver } from '../../driver';
import { pathNormalizeToLinux, pathRelative, getWithoutExt } from '../../utils';


/**
 * Given the tree of file dependencies from the driver, find the components of these files.
 * Each dependency file has a path, use bit.map to search for the component name by that path.
 * If the component is found, add it to "componentsDeps". Otherwise, add it to "untrackedDeps".
 * For the found components, add their sourceRelativePath and destinationRelativePath, it being used later on for
 * generating links upon import.
 *
 * @param {Object} tree - contains direct deps for each file
 * @param {string[]} files - component files to search
 * @param {string} entryComponentId - component id for the entry of traversing - used to know which of the files are part of that component
 * @param {BitMap} bitMap
 * @param {string} consumerPath
 */
function findComponentsOfDepsFiles(tree: Object, files: string[], entryComponentId: string, bitMap: BitMap,
                                   consumerPath: string): Object {
  const packagesDeps = {};
  const componentsDeps = [];
  const untrackedDeps = [];

  const entryComponentMap = bitMap.getComponent(entryComponentId);

  const processedFiles = [];
  files.forEach((file) => {
    const currentPackagesDeps = tree[file].packages;
    if (currentPackagesDeps && !R.isEmpty(currentPackagesDeps)) {
      Object.assign(packagesDeps, currentPackagesDeps);
    }
    const allFilesDeps = tree[file].files;
    if (!allFilesDeps || R.isEmpty(allFilesDeps)) return;
    allFilesDeps.forEach((fileDep) => {
      if (processedFiles.includes(fileDep)) return;
      processedFiles.push(fileDep);
      const rootDir = entryComponentMap.rootDir;

      let fileDepRelative: string = fileDep;
      let componentId: string;
      let destination: string;
      if (rootDir) {
        // Change the dependencies files to be relative to current consumer
        // We can't use path.resolve(rootDir, fileDep) because this might not work when running
        // bit commands not from root, because resolve take by default the process.cwd
        const rootDirFullPath = path.join(consumerPath, rootDir);
        const fullFileDep = path.resolve(rootDirFullPath, fileDep);
        fileDepRelative = pathNormalizeToLinux(path.relative(consumerPath, fullFileDep));
        componentId = bitMap.getComponentIdByPath(fileDepRelative);
      } else {
        fileDepRelative = fileDep;
      }

      if (!componentId) {
        // Check if its a generated index file
        const fileDepWithoutExt = getWithoutExt(path.basename(fileDepRelative));
        if (fileDepWithoutExt === DEFAULT_INDEX_NAME) {
          const indexDir = path.dirname(fileDepRelative);
          componentId = bitMap.getComponentIdByRootPath(indexDir);
          // Refer to the main file in case the source component required the index of the imported
          if (componentId) destination = bitMap.getMainFileOfComponent(componentId);
        }

        if (!componentId) {
          fileDepRelative = fileDep;
          componentId = bitMap.getComponentIdByPath(fileDepRelative);
        }

        // the file dependency doesn't have any counterpart component. Add it to untrackedDeps
        if (!componentId) {
          untrackedDeps.push(fileDepRelative);
          return;
        }
      }

      // happens when in the same component one file requires another one. In this case, there is noting to do
      if (componentId === entryComponentId) return;

      // found a dependency component. Add it to componentsDeps
      const depRootDir = bitMap.getRootDirOfComponent(componentId);
      if (!destination) {
        destination = depRootDir && fileDepRelative.startsWith(depRootDir) ? pathRelative(depRootDir, fileDepRelative) : fileDepRelative;
      }
      // when there is no rootDir for the current dependency (it happens when it's AUTHORED), keep the original path
      const sourceRelativePath = depRootDir ? fileDepRelative : fileDep;

      const depsPaths = { sourceRelativePath, destinationRelativePath: destination };
      const currentComponentsDeps = { [componentId]: [depsPaths] };

      if (componentsDeps[componentId]) {
        // it is another file of an already existing component. Just add the new path
        componentsDeps[componentId].push(depsPaths);
      } else {
        Object.assign(componentsDeps, currentComponentsDeps);
      }
    });
  });
  return { componentsDeps, packagesDeps, untrackedDeps };
}

/**
 * Merge the dependencies-trees we got from all files to one big dependency-tree
 * @param {Object} depTrees
 * @param {ComponentMapFile[]} files
 * @return {{missing: {packages: Array, files: Array}, tree: {}}}
 */
function mergeDependencyTrees(depTrees: Object, files: ComponentMapFile[]): Object {
  if (depTrees.length === 1) return R.head(depTrees);
  if (depTrees.length !== files.length) throw new Error(`Error occurred while resolving dependencies, num of files: ${files.length}, num of resolved dependencies: ${depTrees.length}`);
  const dependencyTree = {
    missing: { packages: [], files: [] },
    tree: {}
  };
  Object.keys(depTrees).forEach((dep, key) => { // the keys of depTrees are parallel to the files
    if (depTrees[dep].missing.packages.length && !files[key].test) { // ignore package dependencies of tests for now
      dependencyTree.missing.packages.push(...depTrees[dep].missing.packages);
    }
    if (depTrees[dep].missing.files && depTrees[dep].missing.files.length) {
      dependencyTree.missing.files.push(...depTrees[dep].missing.files);
    }
    Object.assign(dependencyTree.tree, depTrees[dep].tree);
  });
  dependencyTree.missing.packages = R.uniq(dependencyTree.missing.packages);
  dependencyTree.missing.files = R.uniq(dependencyTree.missing.files);
  return dependencyTree;
}

/**
 * Load components and packages dependencies for a component. The process is as follows:
 * 1) Use the language driver to parse the component files and find for each file its dependencies.
 * 2) The results we get from the driver per file tells us what are the files and packages that depend on our file.
 * and also whether there are missing packages and files.
 * 3) Using the information from the driver, we go over each one of the dependencies files and find its counterpart
 * component. The way how we find it, is by using the bit.map file which has a mapping between the component name and
 * the file paths.
 * 4) If we find a component to the file dependency, we add it to component.dependencies. Otherwise, it's added to
 * component.missingDependencies.untrackedDependencies
 * 5) Similarly, when we find the packages dependencies, they are added to component.packageDependencies. Otherwise,
 * they're added to component.missingDependencies.missingPackagesDependenciesOnFs
 * 6) In case the driver found a file dependency that is not on the file-system, we add that file to
 * component.missingDependencies.missingDependenciesOnFs
 */
export default async function loadDependenciesForComponent(component: Component,
                                                           componentMap: ComponentMap,
                                                           bitDir: string,
                                                           driver: Driver,
                                                           bitMap: BitMap,
                                                           consumerPath: string,
                                                           idWithConcreteVersionString: string): Promise<Component> {
  component.missingDependencies = {};
  const files = componentMap.files.map(file => file.relativePath);
  // find the dependencies (internal files and packages) through automatic dependency resolution
  const treesP = files.map(file => driver.getDependencyTree(bitDir, consumerPath, file));
  const trees = await Promise.all(treesP);
  const dependenciesTree = mergeDependencyTrees(trees, componentMap.files);
  if (dependenciesTree.missing.files && !R.isEmpty(dependenciesTree.missing.files)) {
    component.missingDependencies.missingDependenciesOnFs = dependenciesTree.missing.files;
  }
  if (dependenciesTree.missing.packages && !R.isEmpty(dependenciesTree.missing.packages)) {
    component.missingDependencies.missingPackagesDependenciesOnFs = dependenciesTree.missing.packages;
  }
  // we have the files dependencies, these files should be components that are registered in bit.map. Otherwise,
  // they are referred as "untracked components" and the user should add them later on in order to commit
  const traversedDeps = findComponentsOfDepsFiles(dependenciesTree.tree, files, idWithConcreteVersionString, bitMap, consumerPath);
  const traversedCompDeps = traversedDeps.componentsDeps;
  component.dependencies = Object.keys(traversedCompDeps).map((depId) => {
    return { id: BitId.parse(depId), relativePaths: traversedCompDeps[depId] };
  });
  const untrackedDependencies = traversedDeps.untrackedDeps;
  if (!R.isEmpty(untrackedDependencies)) component.missingDependencies.untrackedDependencies = untrackedDependencies;
  component.packageDependencies = traversedDeps.packagesDeps;

  return component;
}
