/** @flow */
import path from 'path';
import R from 'ramda';
import { DEFAULT_INDEX_NAME, COMPONENT_ORIGINS } from '../../constants';
import BitMap from '../bit-map/bit-map';
import type { ComponentMapFile } from '../bit-map/component-map';
import ComponentMap from '../bit-map/component-map';
import { BitId } from '../../bit-id';
import Component from '../component';
import { Driver } from '../../driver';
import { pathNormalizeToLinux, pathRelative, getWithoutExt } from '../../utils';
import logger from '../../logger/logger';
import { Consumer } from '../../consumer';

/**
 * Given the tree of file dependencies from the driver, find the components of these files.
 * Each dependency file has a path, use bit.map to search for the component name by that path.
 * If the component is found, add it to "componentsDeps". Otherwise, add it to "untrackedDeps".
 *
 * For the found components, add their sourceRelativePath and destinationRelativePath, they are being used for
 * generating links upon import:
 * sourceRelativePath - location of the link file.
 * destinationRelativePath - destination written inside the link file.
 *
 * @param {Object} tree - contains direct deps for each file
 * @param {string[]} files - component files to search
 * @param {string} entryComponentId - component id for the entry of traversing - used to know which of the files are part of that component
 * @param {BitMap} bitMap
 * @param {string} consumerPath
 * @param {string} bindingPrefix
 * @param componentFromModel
 */
function findComponentsOfDepsFiles(
  tree: Object,
  files: string[],
  entryComponentId: string,
  bitMap: BitMap,
  consumerPath: string,
  bindingPrefix: string,
  componentFromModel
): Object {
  const packagesDeps = {};
  const componentsDeps = {};
  const untrackedDeps = [];
  const relativeDeps = []; // dependencies that are required with relative path (and should be required using 'bit/').
  const missingDeps = [];
  const entryComponentMap = bitMap.getComponent(entryComponentId);
  const rootDir = entryComponentMap.rootDir;
  const processedFiles = [];

  const traverseTreeForComponentId = (depFile) => {
    if (!tree[depFile] || (!tree[depFile].files && !tree[depFile].bits)) return;
    const rootDirFullPath = path.join(consumerPath, rootDir);
    if (tree[depFile].files && tree[depFile].files.length) {
      for (const file of tree[depFile].files) {
        const fullDepFile = path.resolve(rootDirFullPath, file);
        const depRelativeToConsumer = pathNormalizeToLinux(path.relative(consumerPath, fullDepFile));
        const componentId = bitMap.getComponentIdByPath(depRelativeToConsumer);
        if (componentId) return componentId;
      }
    }
    if (tree[depFile].bits && tree[depFile].bits.length) {
      for (const bit of tree[depFile].bits) {
        const componentId = Consumer.getComponentIdFromNodeModulesPath(bit, bindingPrefix);
        if (componentId) return componentId;
      }
    }

    for (const file of tree[depFile].files) {
      if (file === depFile) {
        logger.warn(`traverseTreeForComponentId found a cyclic dependency. ${file} depends on itself`);
        continue;
      }
      const componentId = traverseTreeForComponentId(file);
      if (componentId) return componentId;
    }
  };

  const getComponentIdByDepFile = (depFile) => {
    let depFileRelative: string = depFile; // dependency file path relative to consumer root
    let componentId: ?string;
    let destination: ?string;

    if (rootDir) {
      // The depFileRelative is relative to rootDir, change it to be relative to current consumer.
      // We can't use path.resolve(rootDir, fileDep) because this might not work when running
      // bit commands not from root, because resolve take by default the process.cwd
      const rootDirFullPath = path.join(consumerPath, rootDir);
      const fullDepFile = path.resolve(rootDirFullPath, depFile);
      depFileRelative = pathNormalizeToLinux(path.relative(consumerPath, fullDepFile));
    }

    componentId = bitMap.getComponentIdByPath(depFileRelative);
    // if not found here, the file is not a component file. It might be a bit-auto-generated file.
    // find the component file by the auto-generated file.
    // We make sure also that rootDir is there, otherwise, it's an AUTHORED component, which shouldn't have
    // auto-generated files.
    if (rootDir && !componentId) {
      componentId = traverseTreeForComponentId(depFile);
      if (componentId) {
        // it is verified now that this depFile is an auto-generated file, therefore the sourceRelativePath and the
        // destinationRelativePath should be a partial-path and not full-relative-to-consumer path.
        const componentMap = bitMap.getComponent(componentId);
        if (componentMap) destination = componentMap.mainFile;
        else {
          // when there is no componentMap, the bit dependency was imported as a npm package.
          // we're missing two things, which can be obtained from the model: 1) version. 2) mainFile.
          const dependency = componentFromModel.dependencies.find(
            dep => dep.id.toStringWithoutVersion() === componentId
          );
          destination = dependency.mainFile;
          componentId = dependency.id.toString();
        }

        depFileRelative = depFile; // change it back to partial-part, this will be later on the sourceRelativePath
      }
    }

    return { componentId, depFileRelative, destination };
  };

  const processDepFile = (depFile: string, importSpecifiers?: Object, linkFile?: string) => {
    if (processedFiles.includes(depFile)) return;
    processedFiles.push(depFile);

    const { componentId, depFileRelative, destination } = getComponentIdByDepFile(depFile);
    // the file dependency doesn't have any counterpart component. Add it to untrackedDeps
    if (!componentId) {
      untrackedDeps.push(depFileRelative);
      return;
    }

    // happens when in the same component one file requires another one. In this case, there is noting to do
    if (componentId === entryComponentId) return;

    const componentMap = bitMap.getComponent(componentId);
    // found a dependency component. Add it to componentsDeps
    const depRootDir = componentMap ? componentMap.rootDir : undefined;
    const destinationRelativePath =
      destination ||
      (depRootDir && depFileRelative.startsWith(depRootDir)
        ? pathRelative(depRootDir, depFileRelative)
        : depFileRelative);

    let sourceRelativePath;
    if (linkFile) {
      sourceRelativePath = linkFile;
    } else {
      // when there is no rootDir for the current dependency (it happens when it's AUTHORED), keep the original path
      sourceRelativePath = depRootDir ? depFileRelative : depFile;
    }

    const depsPaths = { sourceRelativePath, destinationRelativePath };
    if (importSpecifiers) {
      depsPaths.importSpecifiers = importSpecifiers;
    }
    const currentComponentsDeps = { [componentId]: [depsPaths] };

    if (
      componentMap &&
      ((componentMap.origin === COMPONENT_ORIGINS.IMPORTED &&
        entryComponentMap.origin === COMPONENT_ORIGINS.AUTHORED) ||
        (componentMap.origin === COMPONENT_ORIGINS.AUTHORED && entryComponentMap.origin === COMPONENT_ORIGINS.IMPORTED))
    ) {
      // prevent author using relative paths for IMPORTED component
      // also prevent adding AUTHORED component to an IMPORTED component using relative syntax. The reason is that when
      // this component is imported somewhere else, a link-file between the IMPORTED and the AUTHORED must be written
      // outside the component directory, which might override user files.
      relativeDeps.push(componentId);
      return;
    }

    if (componentsDeps[componentId]) {
      // it is another file of an already existing component. Just add the new path
      componentsDeps[componentId].push(depsPaths);
    } else {
      Object.assign(componentsDeps, currentComponentsDeps);
    }
  };

  const processLinkFile = (linkFile) => {
    if (!linkFile.dependencies || R.isEmpty(linkFile.dependencies)) return;
    linkFile.dependencies.forEach((dependency) => {
      const component = getComponentIdByDepFile(linkFile.file);
      if (component.componentId) {
        // the linkFile is already a component, no need to treat it differently than other depFile
        processDepFile(linkFile.file, dependency.importSpecifiers);
      } else {
        processDepFile(dependency.file, dependency.importSpecifiers, linkFile.file);
      }
    });
  };

  files.forEach((file) => {
    const currentPackagesDeps = tree[file].packages;
    if (currentPackagesDeps && !R.isEmpty(currentPackagesDeps)) {
      Object.assign(packagesDeps, currentPackagesDeps);
    }
    const currentBitsDeps = tree[file].bits;
    if (currentBitsDeps && !R.isEmpty(currentBitsDeps)) {
      currentBitsDeps.forEach((bitDep) => {
        const componentId = Consumer.getComponentIdFromNodeModulesPath(bitDep, bindingPrefix);

        const existingId = bitMap.getExistingComponentId(componentId);
        if (existingId) {
          const currentComponentsDeps = { [existingId]: [] };
          if (!componentsDeps[existingId]) {
            Object.assign(componentsDeps, currentComponentsDeps);
          }
        } else {
          missingDeps.push(componentId);
        }
      });
    }
    const allDepsFiles = tree[file].files;
    if (allDepsFiles && !R.isEmpty(allDepsFiles)) {
      allDepsFiles.forEach((depFile) => {
        let importSpecifiers;
        if (tree[file].importSpecifiers) {
          const importSpecifiersFound = tree[file].importSpecifiers.find(
            specifierFile => specifierFile.file === depFile
          );
          if (importSpecifiersFound) importSpecifiers = importSpecifiersFound.importSpecifiers;
        }
        processDepFile(depFile, importSpecifiers);
      });
    }
    const allLinkFiles = tree[file].linkFiles;
    if (allLinkFiles && !R.isEmpty(allLinkFiles)) {
      allLinkFiles.forEach((linkFile) => {
        processLinkFile(linkFile);
      });
    }
  });
  return { componentsDeps, packagesDeps, untrackedDeps, relativeDeps, missingDeps };
}

/**
 * Merge the dependencies-trees we got from all files to one big dependency-tree
 * @param {Array<Object>} depTrees
 * @return {{missing: {packages: Array, files: Array}, tree: {}}}
 */
function mergeDependencyTrees(depTrees: Array<Object>): Object {
  const dependencyTree = {
    missing: { packages: [], files: [], bits: [] },
    tree: {}
  };
  depTrees.forEach((dep) => {
    if (dep.missing.packages.length) {
      dependencyTree.missing.packages.push(...dep.missing.packages);
    }
    if (dep.missing.files && dep.missing.files.length) {
      dependencyTree.missing.files.push(...dep.missing.files);
    }
    if (dep.missing.bits) {
      dependencyTree.missing.bits.push(...dep.missing.bits);
    }
    Object.assign(dependencyTree.tree, dep.tree);
  });
  dependencyTree.missing.packages = R.uniq(dependencyTree.missing.packages);
  dependencyTree.missing.files = R.uniq(dependencyTree.missing.files);
  dependencyTree.missing.bits = R.uniq(dependencyTree.missing.bits);
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
export default (async function loadDependenciesForComponent(
  component: Component,
  componentMap: ComponentMap,
  bitDir: string,
  consumer: Consumer,
  bitMap: BitMap,
  idWithConcreteVersionString: string,
  componentFromModel: Component
): Promise<Component> {
  const driver: Driver = consumer.driver;
  const consumerPath = consumer.getPath();
  const missingDependencies = {};
  const { allFiles, nonTestsFiles, testsFiles } = componentMap.getFilesGroupedByBeingTests();
  const getDependenciesTree = async () => {
    const nonTestsTree = await driver.getDependencyTree(bitDir, consumerPath, nonTestsFiles, component.bindingPrefix);
    if (!testsFiles.length) return nonTestsTree;
    const testsTree = await driver.getDependencyTree(bitDir, consumerPath, testsFiles, component.bindingPrefix);
    // ignore package dependencies of tests for now
    testsTree.missing.packages = [];
    return mergeDependencyTrees([nonTestsTree, testsTree]);
  };
  // find the dependencies (internal files and packages) through automatic dependency resolution
  const dependenciesTree = await getDependenciesTree();
  if (dependenciesTree.missing.files && !R.isEmpty(dependenciesTree.missing.files)) {
    missingDependencies.missingDependenciesOnFs = dependenciesTree.missing.files;
  }
  if (dependenciesTree.missing.packages && !R.isEmpty(dependenciesTree.missing.packages)) {
    missingDependencies.missingPackagesDependenciesOnFs = dependenciesTree.missing.packages;
  }
  const missingLinks = [];
  let missingComponents = [];
  if (dependenciesTree.missing.bits && !R.isEmpty(dependenciesTree.missing.bits)) {
    dependenciesTree.missing.bits.forEach((missingBit) => {
      const componentId = Consumer.getComponentIdFromNodeModulesPath(missingBit, component.bindingPrefix);
      // todo: a component might be on bit.map but not on the FS, yet, it's not about missing links.
      if (bitMap.getExistingComponentId(componentId)) missingLinks.push(componentId);
      else missingComponents.push(componentId);
    });
  }

  // we have the files dependencies, these files should be components that are registered in bit.map. Otherwise,
  // they are referred as "untracked components" and the user should add them later on in order to commit
  const traversedDeps = findComponentsOfDepsFiles(
    dependenciesTree.tree,
    allFiles,
    idWithConcreteVersionString,
    bitMap,
    consumerPath,
    component.bindingPrefix,
    componentFromModel
  );
  const traversedCompDeps = traversedDeps.componentsDeps;
  component.dependencies = Object.keys(traversedCompDeps).map((depId) => {
    return { id: BitId.parse(depId), relativePaths: traversedCompDeps[depId] };
  });
  const untrackedDependencies = traversedDeps.untrackedDeps;
  if (!R.isEmpty(untrackedDependencies)) missingDependencies.untrackedDependencies = untrackedDependencies;
  component.packageDependencies = traversedDeps.packagesDeps;
  if (!R.isEmpty(traversedDeps.relativeDeps)) {
    missingDependencies.relativeComponents = traversedDeps.relativeDeps;
  }
  if (!R.isEmpty(traversedDeps.missingDeps)) {
    missingComponents = missingComponents.concat(traversedDeps.missingDeps);
  }
  if (missingLinks.length) missingDependencies.missingLinks = missingLinks;
  if (missingComponents.length) missingDependencies.missingComponents = missingComponents;
  // assign missingDependencies to component only when it has data.
  // Otherwise, when it's empty, component.missingDependencies will be an empty object ({}), and for some weird reason,
  // Ramda.isEmpty returns false when the component is received after async/await of Array.map.
  if (!R.isEmpty(missingDependencies)) component.missingDependencies = missingDependencies;

  return component;
});
