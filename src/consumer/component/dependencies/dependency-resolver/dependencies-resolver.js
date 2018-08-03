/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import { COMPONENT_ORIGINS } from '../../../../constants';
import ComponentMap from '../../../bit-map/component-map';
import { BitId, BitIds } from '../../../../bit-id';
import Component from '../../../component';
import { Driver } from '../../../../driver';
import { pathNormalizeToLinux, pathRelativeLinux, pathJoinLinux } from '../../../../utils';
import logger from '../../../../logger/logger';
import { Consumer } from '../../../../consumer';
import type { ImportSpecifier, FileObject, Tree, DependenciesResults } from './types/dependency-tree-type';
import type { PathLinux, PathLinuxRelative } from '../../../../utils/path';
import Dependencies from '../dependencies';
import GeneralError from '../../../../error/general-error';
import { Dependency } from '..';
import type { RelativePath } from '../dependency';

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
 * @param {string[]} testsFiles - component test files
 * @param {BitId} entryComponentId - component id for the entry of traversing - used to know which of the files are part of that component
 * @param {consumer} consumer
 * @param componentFromModel
 */
function findComponentsOfDepsFiles(
  tree: Tree,
  files: string[],
  testsFiles: string[],
  envFiles: string[],
  entryComponentId: BitId,
  consumer: Consumer,
  consumerComponent: Component
): Object {
  const driver: Driver = consumer.driver;
  const bindingPrefix: string = consumerComponent.bindingPrefix;
  const componentFromModel: Component = consumerComponent.componentFromModel;
  const packagesDeps = {};
  let devPackagesDeps = {};
  let envsPackagesDeps = {};
  const componentsDeps: Dependency[] = [];
  let devComponentsDeps: Dependency[] = [];
  let envComponentsDeps: Dependency[] = [];

  const getExistingDependency = (id: BitId): ?Dependency => componentsDeps.find(d => d.id.isEqual(id));
  const getExistingDevDependency = (id: BitId): ?Dependency => devComponentsDeps.find(d => d.id.isEqual(id));
  const getExistingEnvDependency = (id: BitId): ?Dependency => envComponentsDeps.find(d => d.id.isEqual(id));

  // issues
  const missingDependenciesOnFs = {};
  const missingPackagesDependenciesOnFs = {};
  const missingComponents = {};
  const missingLinks = {};
  const missingCustomModuleResolutionLinks = {};
  const untrackedDeps = {};
  const relativeDeps = {}; // dependencies that are required with relative path (and should be required using 'bit/').
  const missingBits = {};
  const parseErrors = {};
  const resolveErrors = {};
  const issues: $PropertyType<Component, 'issues'> = {};

  const consumerPath = consumer.getPath();
  const entryComponentMap = consumer.bitMap.getComponent(entryComponentId);
  const rootDir: PathLinux = entryComponentMap.rootDir;
  const processedFiles = [];

  const traverseTreeForComponentId = (depFile: PathLinux): ?BitId => {
    if (!tree[depFile] || (!tree[depFile].files && !tree[depFile].bits)) return;
    const rootDirFullPath = path.join(consumerPath, rootDir);
    if (tree[depFile].files && tree[depFile].files.length) {
      for (const file of tree[depFile].files) {
        const fullDepFile = path.resolve(rootDirFullPath, file.file);
        const depRelativeToConsumer = pathNormalizeToLinux(path.relative(consumerPath, fullDepFile));
        const componentId = consumer.bitMap.getComponentIdByPath(depRelativeToConsumer);
        if (componentId) return componentId; // eslint-disable-line consistent-return
      }
    }
    if (tree[depFile].bits && tree[depFile].bits.length) {
      for (const bit of tree[depFile].bits) {
        const componentId = consumer.getComponentIdFromNodeModulesPath(bit, bindingPrefix);
        if (componentId) return componentId; // eslint-disable-line consistent-return
      }
    }

    if (tree[depFile].files && tree[depFile].files.length) {
      for (const file of tree[depFile].files) {
        if (file.file !== depFile) {
          const componentId = traverseTreeForComponentId(file.file);
          if (componentId) return componentId; // eslint-disable-line consistent-return
        } else {
          logger.warn(`traverseTreeForComponentId found a cyclic dependency. ${file.file} depends on itself`);
        }
      }
    }
  };

  const getComponentIdByDepFile = (
    depFile: PathLinux
  ): { componentId: ?BitId, depFileRelative: PathLinux, destination: ?string } => {
    let depFileRelative: PathLinux = depFile; // dependency file path relative to consumer root
    let componentId: ?BitId;
    let destination: ?string;

    if (rootDir) {
      // The depFileRelative is relative to rootDir, change it to be relative to current consumer.
      // We can't use path.resolve(rootDir, fileDep) because this might not work when running
      // bit commands not from root, because resolve take by default the process.cwd
      const rootDirFullPath = path.join(consumerPath, rootDir);
      const fullDepFile = path.resolve(rootDirFullPath, depFile);
      depFileRelative = pathNormalizeToLinux(path.relative(consumerPath, fullDepFile));
    }

    componentId = consumer.bitMap.getComponentIdByPath(depFileRelative);
    // if not found here, the file is not a component file. It might be a bit-auto-generated file.
    // find the component file by the auto-generated file.
    // We make sure also that rootDir is there, otherwise, it's an AUTHORED component, which shouldn't have
    // auto-generated files.
    if (!componentId && rootDir) {
      componentId = traverseTreeForComponentId(depFile);
      if (componentId) {
        // it is verified now that this depFile is an auto-generated file, therefore the sourceRelativePath and the
        // destinationRelativePath should be a partial-path and not full-relative-to-consumer path.
        // since the dep-file is a generated file, it is safe to assume that the componentFromModel has in its
        // dependencies array this component with the relativePaths array. Find the relativePath of this dep-file
        // to get the correct destinationRelativePath. There is no other way to obtain this info.
        if (!componentFromModel) {
          throw new GeneralError(`Failed to resolve ${componentId.toString()} dependencies because the component is not in the model.
Try to run "bit import ${consumerComponent.id.toString()} --objects" to get the component saved in the model`);
        }
        const dependency = componentFromModel
          .getAllDependencies() // $FlowFixMe
          .find(dep => dep.id.isEqualWithoutVersion(componentId));
        if (!dependency) {
          throw new GeneralError( // $FlowFixMe
            `the auto-generated file ${depFile} should be connected to ${componentId}, however, it's not part of the model dependencies of ${
              componentFromModel.id
            }`
          );
        }
        const originallySource: PathLinux = entryComponentMap.originallySharedDir
          ? pathJoinLinux(entryComponentMap.originallySharedDir, depFile)
          : depFile;
        const relativePath: RelativePath = dependency.relativePaths.find(
          r => r.sourceRelativePath === originallySource
        );
        if (!relativePath) {
          throw new GeneralError(
            `unable to find ${originallySource} path in the dependencies relativePaths of ${componentFromModel.id}`
          );
        }

        componentId = dependency.id;
        destination = relativePath.destinationRelativePath;

        depFileRelative = depFile; // change it back to partial-part, this will be later on the sourceRelativePath
      }
    }

    return { componentId, depFileRelative, destination };
  };

  const processDepFile = (
    originFile: PathLinuxRelative,
    depFile: string,
    importSpecifiers?: ImportSpecifier[],
    linkFile?: string,
    isTestFile: boolean = false,
    isEnvFile: boolean = false,
    depFileObject: FileObject
  ) => {
    if (processedFiles.includes(depFile)) return;
    processedFiles.push(depFile);

    // if the dependency of an envFile is already included in the env files of the component, we're good
    if (isEnvFile && envFiles.includes(depFile)) return;

    const { componentId, depFileRelative, destination } = getComponentIdByDepFile(depFile);
    // the file dependency doesn't have any counterpart component. Add it to untrackedDeps
    if (!componentId) {
      if (untrackedDeps[originFile]) untrackedDeps[originFile].push(depFileRelative);
      else untrackedDeps[originFile] = [depFileRelative];
      return;
    }

    // happens when in the same component one file requires another one. In this case, there is
    // noting to do regarding the dependencies
    if (componentId.isEqual(entryComponentId)) {
      if (depFileObject.isCustomResolveUsed) {
        consumerComponent.customResolvedPaths.push({
          destinationPath: depFileObject.file,
          importSource: depFileObject.importSource
        });
      }
      return;
    }

    const componentMap = consumer.bitMap.getComponentIfExist(componentId);
    // found a dependency component. Add it to componentsDeps
    const depRootDir = componentMap ? componentMap.rootDir : undefined;
    const destinationRelativePath =
      destination ||
      (depRootDir && depFileRelative.startsWith(depRootDir)
        ? pathRelativeLinux(depRootDir, depFileRelative)
        : depFileRelative);

    let sourceRelativePath;
    if (linkFile) {
      sourceRelativePath = linkFile;
    } else {
      // when there is no rootDir for the current dependency (it happens when it's AUTHORED), keep the original path
      sourceRelativePath = depRootDir ? depFileRelative : depFile;
    }

    const depsPaths: RelativePath = {
      sourceRelativePath,
      destinationRelativePath
    };
    if (importSpecifiers) {
      depsPaths.importSpecifiers = importSpecifiers;
    }
    if (depFileObject.isCustomResolveUsed) {
      depsPaths.isCustomResolveUsed = depFileObject.isCustomResolveUsed;
      depsPaths.importSource = depFileObject.importSource;
    }
    const currentComponentsDeps: Dependency = { id: componentId, relativePaths: [depsPaths] };

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
      if (relativeDeps[originFile]) relativeDeps[originFile].push(componentId);
      else relativeDeps[originFile] = [componentId];
      return;
    }

    const existingDependency = getExistingDependency(componentId);
    const existingDevDependency = getExistingDevDependency(componentId);
    if (existingDependency) {
      // it is another file of an already existing component. Just add the new path
      existingDependency.relativePaths.push(depsPaths);
    } else if (existingDevDependency) {
      existingDevDependency.relativePaths.push(depsPaths);
    } else if (isTestFile) {
      devComponentsDeps.push(currentComponentsDeps);
    } else if (isEnvFile) {
      envComponentsDeps.push(currentComponentsDeps);
    } else {
      componentsDeps.push(currentComponentsDeps);
    }
  };

  const processLinkFile = (
    originFile: PathLinuxRelative,
    linkFile: FileObject,
    isTestFile: boolean = false,
    isEnvFile: boolean = false
  ) => {
    if (!linkFile.linkDependencies || R.isEmpty(linkFile.linkDependencies)) return;
    const nonLinkImportSpecifiers = [];
    linkFile.linkDependencies.forEach((dependency) => {
      const component = getComponentIdByDepFile(linkFile.file);
      if (component.componentId) {
        // the linkFile is already a component, no need to treat it differently than other depFile
        // aggregate all dependencies using the same linkFile and ultimately run processDepFile
        // with all importSpecifiers of that linkFile.
        // also, delete the linkFile attribute of importSpecifiers so then once the component is
        // imported and the link is generated, it won't be treated as a linkFile.
        dependency.importSpecifiers.map(a => delete a.linkFile);
        nonLinkImportSpecifiers.push(dependency.importSpecifiers);
      } else {
        processDepFile(
          originFile,
          dependency.file,
          dependency.importSpecifiers,
          linkFile.file,
          isTestFile,
          isEnvFile,
          linkFile
        );
      }
    });
    if (nonLinkImportSpecifiers.length) {
      processDepFile(
        originFile,
        linkFile.file,
        R.flatten(nonLinkImportSpecifiers),
        undefined,
        isTestFile,
        isEnvFile,
        linkFile
      );
    }
  };

  const processDepFiles = (
    originFile: PathLinuxRelative,
    allDepsFiles?: FileObject[],
    isTestFile: boolean = false,
    isEnvFile: boolean = false
  ) => {
    if (!allDepsFiles || R.isEmpty(allDepsFiles)) return;
    allDepsFiles.forEach((depFile: FileObject) => {
      if (depFile.isLink) processLinkFile(originFile, depFile, isTestFile, isEnvFile);
      else {
        processDepFile(originFile, depFile.file, depFile.importSpecifiers, undefined, isTestFile, isEnvFile, depFile);
      }
    });
  };

  const processBits = (
    originFile: PathLinuxRelative,
    bits,
    isTestFile: boolean = false,
    isEnvFile: boolean = false
  ) => {
    if (!bits || R.isEmpty(bits)) return;
    bits.forEach((bitDep) => {
      const componentId: BitId = consumer.getComponentIdFromNodeModulesPath(bitDep, bindingPrefix);
      const getExistingId = (): ?BitId => {
        let existingId = consumer.bitmapIds.searchWithoutVersion(componentId);
        if (existingId) return existingId;

        // maybe the dependencies were imported as npm packages
        if (bitDep.startsWith('node_modules')) {
          // Add the root dir in case it exists (to make sure we search for the dependency package json in the correct place)
          const basePath = rootDir ? path.join(consumerPath, rootDir) : consumerPath;
          const depPath = path.join(basePath, bitDep);
          const packageJson = driver.driver.PackageJson.findPackage(depPath);
          if (packageJson) {
            const depVersion = packageJson.version;
            existingId = componentId.changeVersion(depVersion);
            return existingId;
          }
        }
        if (componentFromModel) {
          const modelDep = componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
          if (modelDep) return modelDep;
        }
        return null;
      };
      const existingId = getExistingId();
      if (existingId) {
        const currentComponentsDeps: Dependency = { id: existingId, relativePaths: [] };
        const existingDependency = getExistingDependency(existingId);
        if (!existingDependency) {
          if (isTestFile) {
            devComponentsDeps.push(currentComponentsDeps);
          } else if (isEnvFile) {
            envComponentsDeps.push(currentComponentsDeps);
          } else {
            componentsDeps.push(currentComponentsDeps);
          }
        }
      } else {
        missingBits[originFile] ? missingBits[originFile].push(componentId) : (missingBits[originFile] = [componentId]);
      }
    });
  };

  const processPackages = (originFile, packages, isTestFile, isEnvFile) => {
    if (packages && !R.isEmpty(packages)) {
      if (isTestFile) {
        Object.assign(devPackagesDeps, packages);
      } else if (isEnvFile) {
        Object.assign(envsPackagesDeps, packages);
      } else {
        Object.assign(packagesDeps, packages);
      }
    }
  };

  /**
   * currently the only unidentified packages being process are the ones coming from custom-modules-resolution.
   * assuming the author used custom-resolution, which enable using non-relative import syntax,
   * for example, requiring the file 'src/utils/is-string' from anywhere as require('utils/is-string');
   * now, when the component is imported, the driver recognizes 'utils/is-string' as a package,
   * because it's not relative.
   * the goal here is to use the 'package' the driver found and match it with one of the
   * dependencies from the model. In the example above, we might find in the model, a dependency
   * is-string with importSource of 'utils/is-string'.
   * Once a match is found, copy the relativePaths from the model. Before coping, we must strip the
   * originallySharedDir, because in this process, the component is loaded from the filesystem and
   * as such the sharedDir is expected to be stripped.
   */
  const processUnidentifiedPackages = (
    originFile,
    unidentifiedPackages?: string[],
    isTestFile: boolean = false,
    isEnvFile: boolean = false
  ) => {
    if (!unidentifiedPackages) return;
    if (!componentFromModel) return; // not relevant, the component is not imported
    const getDependencies = (): Dependencies => {
      if (isTestFile) return componentFromModel.devDependencies;
      if (isEnvFile) return componentFromModel.envDependencies;
      return componentFromModel.dependencies;
    };
    const dependencies: Dependencies = getDependencies();
    if (dependencies.isEmpty()) return;
    const importSourceMap = dependencies.getCustomResolvedData();
    if (R.isEmpty(importSourceMap)) return;
    // clone before stripping the sharedDir to not change the model by mistake
    const clonedDependencies = new Dependencies(dependencies.getClone());
    if (entryComponentMap.originallySharedDir) {
      // @todo: disabled for now. When the files are saved into the model, we don't add the sharedDir
      // in this case, so it should be fine. (see sources.consumerComponentToVersion())
      // it needs some more thinking whether there are cases when it is needed
      // clonedDependencies.stripOriginallySharedDir(consumer.bitMap, entryComponentMap.originallySharedDir);
    }
    unidentifiedPackages.forEach((unidentifiedPackage) => {
      const packageLinuxFormat = pathNormalizeToLinux(unidentifiedPackage);
      const packageWithNoNodeModules = packageLinuxFormat.replace('node_modules/', '');
      const foundImportSource = Object.keys(importSourceMap).find(importSource =>
        packageWithNoNodeModules.startsWith(importSource)
      );
      if (foundImportSource) {
        const dependencyId: BitId = importSourceMap[foundImportSource];
        const existingDependency = getExistingDependency(dependencyId);
        const existingDevDependency = getExistingDevDependency(dependencyId);
        const existingEnvDependency = getExistingEnvDependency(dependencyId);
        if (isTestFile && !existingDevDependency) {
          devComponentsDeps.push({ id: dependencyId, relativePaths: dependencies.getById(dependencyId).relativePaths });
        } else if (isEnvFile && !existingEnvDependency) {
          envComponentsDeps.push({ id: dependencyId, relativePaths: dependencies.getById(dependencyId).relativePaths });
        } else if (!isTestFile && !isEnvFile && !existingDependency) {
          componentsDeps.push({
            id: dependencyId,
            relativePaths: clonedDependencies.getById(dependencyId).relativePaths
          });
        }
      }
    });
  };

  /**
   * Remove the dependencies which appear both in dev and regular deps from the dev
   * Because if a dependency is both dev dependency and regular dependency it should be treated as regular one
   * Apply for both packages and components dependencies
   */
  const removeDevAndEnvDepsIfTheyAlsoRegulars = () => {
    // remove dev and env packages that are also regular packages
    const getNotRegularPackages = packages => R.difference(R.keys(packages), R.keys(packagesDeps));
    devPackagesDeps = R.pick(getNotRegularPackages(devPackagesDeps), devPackagesDeps);
    envsPackagesDeps = R.pick(getNotRegularPackages(envsPackagesDeps), envsPackagesDeps);

    // remove dev and env dependencies that are also regular dependencies
    const componentDepsIds = new BitIds(...componentsDeps.map(c => c.id));
    devComponentsDeps = devComponentsDeps.filter(d => !componentDepsIds.has(d.id));
    envComponentsDeps = envComponentsDeps.filter(d => !componentDepsIds.has(d.id));
  };

  /**
   * given missing packages name, find whether they were dependencies with custom-resolve before.
   */
  const findOriginallyCustomModuleResolvedDependencies = (packages: string[]): ?Object => {
    if (!packages) return undefined;
    if (!componentFromModel) return undefined; // not relevant, the component is not imported
    const dependencies: Dependencies = new Dependencies(componentFromModel.getAllDependencies());
    if (dependencies.isEmpty()) return undefined;
    const importSourceMap = dependencies.getCustomResolvedData();
    if (R.isEmpty(importSourceMap)) return undefined;
    const foundPackages = packages.reduce((acc, value) => {
      const packageLinuxFormat = pathNormalizeToLinux(value);
      const foundImportSource = Object.keys(importSourceMap).find(importSource =>
        importSource.startsWith(packageLinuxFormat)
      );
      if (foundImportSource) {
        const dependencyId = importSourceMap[foundImportSource];
        acc[value] = dependencyId;
      }
      return acc;
    }, {});

    return R.isEmpty(foundPackages) ? undefined : foundPackages;
  };

  const processMissing = (originFile: PathLinuxRelative, missing: $ElementType<DependenciesResults, 'missing'>) => {
    if (!missing) return;
    const componentFiles = consumerComponent.files;
    const doesFileExistInComponent = !R.isEmpty(
      componentFiles.filter(componentFile => pathNormalizeToLinux(componentFile.relative) === originFile)
    );
    if (doesFileExistInComponent) {
      if (missing.files && !R.isEmpty(missing.files)) {
        if (missingDependenciesOnFs[originFile]) {
          missingDependenciesOnFs[originFile].concat(missing.files);
        } else missingDependenciesOnFs[originFile] = missing.files;
      }
      if (missing.packages && !R.isEmpty(missing.packages)) {
        const customResolvedDependencies = findOriginallyCustomModuleResolvedDependencies(missing.packages);
        if (customResolvedDependencies) {
          Object.keys(customResolvedDependencies).forEach((missingPackage) => {
            const componentId = customResolvedDependencies[missingPackage].toString();
            if (missingCustomModuleResolutionLinks[originFile]) {
              missingCustomModuleResolutionLinks[originFile].push(componentId);
            } else missingCustomModuleResolutionLinks[originFile] = [componentId];
          });
        }
        const missingPackages = customResolvedDependencies
          ? R.difference(missing.packages, Object.keys(customResolvedDependencies))
          : missing.packages;

        if (!R.isEmpty(missingPackages)) {
          if (missingPackagesDependenciesOnFs[originFile]) {
            missingPackagesDependenciesOnFs[originFile].concat(missing.packages);
          } else missingPackagesDependenciesOnFs[originFile] = missing.packages;
        }
      }

      if (missing.bits && !R.isEmpty(missing.bits)) {
        missing.bits.forEach((missingBit) => {
          const componentId = consumer.getComponentIdFromNodeModulesPath(missingBit, consumerComponent.bindingPrefix);
          // todo: a component might be on bit.map but not on the FS, yet, it's not about missing links.
          if (consumer.bitMap.getBitIdIfExist(componentId, { ignoreVersion: true })) {
            if (missingLinks[originFile]) missingLinks[originFile].push(componentId);
            else missingLinks[originFile] = [componentId];
          } else if (missingComponents[originFile]) missingComponents[originFile].push(componentId);
          else missingComponents[originFile] = [componentId];
        });
      }
    }
  };

  const processErrors = (originFile: PathLinuxRelative, error?: Error) => {
    if (!error) return;
    logger.error('got an error from the driver while resolving dependencies');
    logger.error(error);
    // $FlowFixMe error.code is set when it comes from bit-javascript, otherwise, it's undefined and treated as resolve-error
    if (error.code === 'PARSING_ERROR') parseErrors[originFile] = error.message;
    else resolveErrors[originFile] = error.message;
  };

  const copyEnvDependenciesFromModelIfNeeded = () => {
    if (shouldProcessEnvDependencies(entryComponentMap)) return;
    // if we don't process env dependencies, we copy the dependencies from the model.
    envComponentsDeps = componentFromModel.envDependencies.get();
  };

  const combineIssues = () => {
    if (!R.isEmpty(missingDependenciesOnFs)) issues.missingDependenciesOnFs = missingDependenciesOnFs;
    if (!R.isEmpty(missingPackagesDependenciesOnFs)) {
      issues.missingPackagesDependenciesOnFs = missingPackagesDependenciesOnFs;
    }
    if (!R.isEmpty(missingLinks)) issues.missingLinks = missingLinks;
    if (!R.isEmpty(missingCustomModuleResolutionLinks)) {
      issues.missingCustomModuleResolutionLinks = missingCustomModuleResolutionLinks;
    }
    if (!R.isEmpty(missingComponents)) issues.missingComponents = missingComponents;

    if (!R.isEmpty(untrackedDeps)) issues.untrackedDependencies = untrackedDeps;
    if (!R.isEmpty(relativeDeps)) issues.relativeComponents = relativeDeps;
    if (!R.isEmpty(missingBits)) {
      if (!issues.missingComponents) issues.missingComponents = {};
      Object.keys(missingBits).forEach((missingBit) => {
        if (issues.missingComponents[missingBit]) {
          issues.missingComponents[missingBit] = issues.missingComponents[missingBit].concat(missingBits[missingBit]);
        } else {
          issues.missingComponents[missingBit] = missingBits[missingBit];
        }
      });
    }
    if (!R.isEmpty(parseErrors)) issues.parseErrors = parseErrors;
    if (!R.isEmpty(resolveErrors)) issues.resolveErrors = resolveErrors;
  };

  files.forEach((file: string) => {
    const isTestFile = R.contains(file, testsFiles);
    const isEnvFile = R.contains(file, envFiles);
    if (!tree[file]) {
      throw new Error(
        `DependencyResolver: a file ${file} was not returned from the driver, its dependencies are unknown`
      );
    }
    processMissing(file, tree[file].missing);
    processErrors(file, tree[file].error);
    processPackages(file, tree[file].packages, isTestFile, isEnvFile);
    processBits(file, tree[file].bits, isTestFile, isEnvFile);
    processDepFiles(file, tree[file].files, isTestFile, isEnvFile);
    processUnidentifiedPackages(file, tree[file].unidentifiedPackages, isTestFile, isEnvFile);
  });
  removeDevAndEnvDepsIfTheyAlsoRegulars();
  copyEnvDependenciesFromModelIfNeeded();
  combineIssues();

  return {
    componentsDeps,
    devComponentsDeps,
    envComponentsDeps,
    packagesDeps,
    devPackagesDeps,
    envsPackagesDeps,
    issues
  };
}

// @todo: move to bit-javascript
/**
 * For author, the peer-dependencies are set in the root package.json
 * For imported components, we don't want to change the peerDependencies of the author, unless
 * we're certain the user intent to do so. Therefore, we ignore the root package.json and look for
 * the package.json in the component's directory.
 */
function findPeerDependencies(consumerPath: string, component: Component): Object {
  const componentMap = component.componentMap;
  const getPeerDependencies = (): Object => {
    const componentRoot = componentMap.origin === COMPONENT_ORIGINS.AUTHORED ? consumerPath : componentMap.rootDir;
    const packageJsonLocation = path.join(componentRoot, 'package.json');
    if (fs.existsSync(packageJsonLocation)) {
      try {
        const packageJson = fs.readJsonSync(packageJsonLocation);
        if (packageJson.peerDependencies) return packageJson.peerDependencies;
      } catch (err) {
        logger.error(
          `Failed reading the project package.json at ${packageJsonLocation}. Error Message: ${err.message}`
        );
      }
    }
    if (component.componentFromModel && componentMap.origin !== COMPONENT_ORIGINS.AUTHORED) {
      return component.componentFromModel.peerPackageDependencies;
    }
    return {};
  };
  const projectPeerDependencies = getPeerDependencies();
  const peerPackages = {};
  if (R.isEmpty(projectPeerDependencies)) return {};
  // check whether the peer-dependencies was actually require in the code. if so, remove it from
  // the packages/dev-packages and add it as a peer-package.
  Object.keys(projectPeerDependencies).forEach((pkg) => {
    ['packageDependencies', 'devPackageDependencies'].forEach((field) => {
      if (Object.keys(component[field]).includes(pkg)) {
        delete component[field][pkg];
        peerPackages[pkg] = projectPeerDependencies[pkg];
      }
    });
  });
  return peerPackages;
}

/**
 * if the component doesn't have the env files written on the filesystem there is nothing to pass
 * to the dependencyResolver
 */
function shouldProcessEnvDependencies(componentMap: ComponentMap): boolean {
  return Boolean(componentMap.origin === COMPONENT_ORIGINS.AUTHORED || componentMap.configDir);
}

/**
 * get environment (compiler/tester) files relative to component root, or, if it's author, relative to consumer
 */
function getEnvFiles(componentMap: ComponentMap, component: Component, consumer: Consumer): PathLinux[] {
  const getFiles = () => {
    if (!shouldProcessEnvDependencies(componentMap)) {
      return [];
    }
    const compilerFiles = component.compiler && component.compiler.files ? component.compiler.files : [];
    const testerFiles = component.tester && component.tester.files ? component.tester.files : [];
    return [...compilerFiles, ...testerFiles];
  };
  const getPathsRelativeToComponentRoot = () => {
    const envFilesObjects = getFiles();
    const rootDirAbsolute = consumer.toAbsolutePath(componentMap.rootDir || '.');
    return envFilesObjects.map((file) => {
      const envAbsolute = file.path;
      return path.relative(rootDirAbsolute, envAbsolute);
    });
  };
  const envFiles = getPathsRelativeToComponentRoot().map(file => pathNormalizeToLinux(file));
  return envFiles;
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
 * component.issues.untrackedDependencies
 * 5) Similarly, when we find the packages dependencies, they are added to component.packageDependencies. Otherwise,
 * they're added to component.issues.missingPackagesDependenciesOnFs
 * 6) In case the driver found a file dependency that is not on the file-system, we add that file to
 * component.issues.missingDependenciesOnFs
 */
export default (async function loadDependenciesForComponent(
  component: Component,
  bitDir: string,
  consumer: Consumer,
  idWithConcreteVersion: BitId
): Promise<Component> {
  const driver: Driver = consumer.driver;
  const consumerPath = consumer.getPath();
  const componentMap: ComponentMap = component.componentMap;
  const { nonTestsFiles, testsFiles } = componentMap.getFilesGroupedByBeingTests();
  const envFiles = getEnvFiles(componentMap, component, consumer);
  const allFiles = [...nonTestsFiles, ...testsFiles, ...envFiles];
  const getDependenciesTree = async () => {
    return driver.getDependencyTree(
      bitDir,
      consumerPath,
      allFiles,
      component.bindingPrefix,
      consumer.bitJson.resolveModules
    );
  };
  // find the dependencies (internal files and packages) through automatic dependency resolution
  const dependenciesTree = await getDependenciesTree();
  // we have the files dependencies, these files should be components that are registered in bit.map. Otherwise,
  // they are referred as "untracked components" and the user should add them later on in order to commit
  const traversedDeps = findComponentsOfDepsFiles(
    dependenciesTree.tree,
    allFiles,
    testsFiles,
    envFiles,
    idWithConcreteVersion,
    consumer,
    component
  );
  const { componentsDeps, devComponentsDeps, envComponentsDeps, issues } = traversedDeps;
  component.setDependencies(componentsDeps);
  component.setDevDependencies(devComponentsDeps);
  component.setEnvDependencies(envComponentsDeps);
  component.packageDependencies = traversedDeps.packagesDeps;
  component.devPackageDependencies = traversedDeps.devPackagesDeps;
  component.envsPackageDependencies = traversedDeps.envsPackagesDeps;
  component.peerPackageDependencies = findPeerDependencies(consumerPath, component);
  // assign issues to component only when it has data.
  // Otherwise, when it's empty, component.issues will be an empty object ({}), and for some weird reason,
  // Ramda.isEmpty returns false when the component is received after async/await of Array.map.
  if (!R.isEmpty(issues)) component.issues = issues;

  return component;
});
