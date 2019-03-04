/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import { COMPONENT_ORIGINS } from '../../../../constants';
import ComponentMap from '../../../bit-map/component-map';
import { BitId, BitIds } from '../../../../bit-id';
import type Component from '../../../component/consumer-component';
import { Driver } from '../../../../driver';
import { pathNormalizeToLinux, pathRelativeLinux } from '../../../../utils';
import logger from '../../../../logger/logger';
import type Consumer from '../../../../consumer/consumer';
import type { ImportSpecifier, FileObject, Tree } from './types/dependency-tree-type';
import type { PathLinux, PathOsBased, PathLinuxRelative } from '../../../../utils/path';
import Dependencies from '../dependencies';
import GeneralError from '../../../../error/general-error';
import { Dependency } from '..';
import type { RelativePath } from '../dependency';
import EnvExtension from '../../../../extensions/env-extension';
import BitMap from '../../../bit-map';
import { isSupportedExtension } from '../../../../links/link-content';

type AllDependencies = {
  dependencies: Dependency[],
  devDependencies: Dependency[],
  compilerDependencies: Dependency[],
  testerDependencies: Dependency[]
};

type AllPackagesDependencies = {
  packageDependencies: ?Object,
  devPackageDependencies: ?Object,
  compilerPackageDependencies: ?Object,
  testerPackageDependencies: ?Object
};

type FileType = {
  isTestFile: boolean,
  isCompilerFile: boolean,
  isTesterFile: boolean
};

export default class DependencyResolver {
  component: Component;
  consumer: Consumer;
  componentId: BitId;
  componentMap: ComponentMap;
  componentFromModel: Component;
  consumerPath: PathOsBased;
  tree: Tree;
  allDependencies: AllDependencies;
  allPackagesDependencies: AllPackagesDependencies;
  issues: $PropertyType<Component, 'issues'>;
  processedFiles: string[];
  compilerFiles: PathLinux[];
  testerFiles: PathLinux[];
  constructor(component: Component, consumer: Consumer, componentId: BitId) {
    this.component = component;
    this.consumer = consumer;
    this.componentId = componentId;
    this.componentMap = this.component.componentMap;
    this.componentFromModel = this.component.componentFromModel;
    this.consumerPath = this.consumer.getPath();
    this.allDependencies = {
      dependencies: [],
      devDependencies: [],
      compilerDependencies: [],
      testerDependencies: []
    };
    this.allPackagesDependencies = {
      packageDependencies: {},
      devPackageDependencies: {},
      compilerPackageDependencies: {},
      testerPackageDependencies: {}
    };
    this.processedFiles = [];
    this.issues = {
      missingPackagesDependenciesOnFs: {},
      missingComponents: {},
      untrackedDependencies: {},
      missingDependenciesOnFs: {},
      missingLinks: {},
      missingCustomModuleResolutionLinks: {},
      relativeComponents: {},
      parseErrors: {},
      resolveErrors: {},
      missingBits: {} // temporarily, will be combined with missingComponents. see combineIssues
    };
  }

  setTree(tree: Tree) {
    this.tree = tree;
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
  async loadDependenciesForComponent(bitDir: string, cacheResolvedDependencies: Object): Promise<Component> {
    const driver: Driver = this.consumer.driver;
    const { nonTestsFiles, testsFiles } = this.componentMap.getFilesGroupedByBeingTests();
    this.setCompilerFiles();
    this.setTesterFiles();
    const allFiles = [...nonTestsFiles, ...testsFiles, ...this.compilerFiles, ...this.testerFiles];
    const getDependenciesTree = async () => {
      return driver.getDependencyTree(
        bitDir,
        this.consumerPath,
        allFiles,
        this.component.bindingPrefix,
        this.consumer.bitJson.resolveModules,
        cacheResolvedDependencies
      );
    };
    // find the dependencies (internal files and packages) through automatic dependency resolution
    const dependenciesTree = await getDependenciesTree();
    // we have the files dependencies, these files should be components that are registered in bit.map. Otherwise,
    // they are referred as "untracked components" and the user should add them later on in order to tag
    this.setTree(dependenciesTree.tree);
    this.populateDependencies(allFiles, testsFiles);
    this.component.setDependencies(this.allDependencies.dependencies);
    this.component.setDevDependencies(this.allDependencies.devDependencies);
    this.component.setCompilerDependencies(this.allDependencies.compilerDependencies);
    this.component.setTesterDependencies(this.allDependencies.testerDependencies);
    this.component.packageDependencies = this.allPackagesDependencies.packageDependencies;
    this.component.devPackageDependencies = this.allPackagesDependencies.devPackageDependencies;
    this.component.compilerPackageDependencies = R.merge(
      this.allPackagesDependencies.compilerPackageDependencies,
      this.component.compilerPackageDependencies
    );
    this.component.testerPackageDependencies = R.merge(
      this.allPackagesDependencies.testerPackageDependencies,
      this.component.testerPackageDependencies
    );
    this.component.peerPackageDependencies = findPeerDependencies(this.consumerPath, this.component);
    if (!R.isEmpty(this.issues)) this.component.issues = this.issues;

    return this.component;
  }

  /**
   * Given the tree of file dependencies from the driver, find the components of these files.
   * Each dependency file has a path, use bit.map to search for the component name by that path.
   * If the component is found, add it to "this.allDependencies.dependencies". Otherwise, add it to "this.issues.untrackedDependencies".
   *
   * For the found components, add their sourceRelativePath and destinationRelativePath, they are being used for
   * generating links upon import:
   * sourceRelativePath - location of the link file.
   * destinationRelativePath - destination written inside the link file.
   */
  populateDependencies(files: string[], testsFiles: string[]) {
    files.forEach((file: string) => {
      const fileType: FileType = {
        isTestFile: R.contains(file, testsFiles),
        isCompilerFile: R.contains(file, this.compilerFiles),
        isTesterFile: R.contains(file, this.testerFiles)
      };
      if (!this.tree[file]) {
        throw new Error(
          `DependencyResolver: a file "${file}" was not returned from the driver, its dependencies are unknown`
        );
      }
      this.processMissing(file);
      this.processErrors(file);
      this.processPackages(file, fileType);
      this.processBits(file, fileType);
      this.processDepFiles(file, fileType);
      this.processUnidentifiedPackages(file, fileType);
    });
    this.removeDevAndEnvDepsIfTheyAlsoRegulars();
    this.copyEnvDependenciesFromModelIfNeeded();
    this.combineIssues();
    this.removeEmptyIssues();
  }

  traverseTreeForComponentId(depFile: PathLinux): ?BitId {
    if (!this.tree[depFile] || (!this.tree[depFile].files && !this.tree[depFile].bits)) return;
    if (!this.componentMap.rootDir) {
      throw Error('traverseTreeForComponentId should get called only when rootDir is set');
    }
    const rootDirFullPath = path.join(this.consumerPath, this.componentMap.rootDir);
    if (this.tree[depFile].files && this.tree[depFile].files.length) {
      for (const file of this.tree[depFile].files) {
        const fullDepFile = path.resolve(rootDirFullPath, file.file);
        const depRelativeToConsumer = pathNormalizeToLinux(path.relative(this.consumerPath, fullDepFile));
        const componentId = this.consumer.bitMap.getComponentIdByPath(depRelativeToConsumer);
        if (componentId) return componentId; // eslint-disable-line consistent-return
      }
    }
    if (this.tree[depFile].bits && this.tree[depFile].bits.length) {
      for (const bit of this.tree[depFile].bits) {
        const componentId = this.consumer.getComponentIdFromNodeModulesPath(bit, this.component.bindingPrefix);
        if (componentId) return componentId; // eslint-disable-line consistent-return
      }
    }

    if (this.tree[depFile].files && this.tree[depFile].files.length) {
      for (const file of this.tree[depFile].files) {
        if (file.file !== depFile) {
          const componentId = this.traverseTreeForComponentId(file.file);
          if (componentId) return componentId; // eslint-disable-line consistent-return
        } else {
          logger.warn(`traverseTreeForComponentId found a cyclic dependency. ${file.file} depends on itself`);
        }
      }
    }
  }

  getComponentIdByDepFile(
    depFile: PathLinux
  ): { componentId: ?BitId, depFileRelative: PathLinux, destination: ?string } {
    let depFileRelative: PathLinux = depFile; // dependency file path relative to consumer root
    let componentId: ?BitId;
    let destination: ?string;
    const rootDir = this.componentMap.rootDir;
    if (rootDir) {
      // The depFileRelative is relative to rootDir, change it to be relative to current consumer.
      // We can't use path.resolve(rootDir, fileDep) because this might not work when running
      // bit commands not from root, because resolve take by default the process.cwd
      const rootDirFullPath = path.join(this.consumerPath, rootDir);
      const fullDepFile = path.resolve(rootDirFullPath, depFile);
      depFileRelative = pathNormalizeToLinux(path.relative(this.consumerPath, fullDepFile));
    }

    componentId = this.consumer.bitMap.getComponentIdByPath(depFileRelative);
    if (!componentId) componentId = this._getComponentIdFromCustomResolveToPackageWithDist(depFileRelative);
    // if not found here, the file is not a component file. It might be a bit-auto-generated file.
    // find the component file by the auto-generated file.
    // We make sure also that rootDir is there, otherwise, it's an AUTHORED component, which shouldn't have
    // auto-generated files.
    if (!componentId && rootDir) {
      componentId = this.traverseTreeForComponentId(depFile);
      if (componentId) {
        // it is verified now that this depFile is an auto-generated file, therefore the sourceRelativePath and the
        // destinationRelativePath should be a partial-path and not full-relative-to-consumer path.
        // since the dep-file is a generated file, it is safe to assume that the componentFromModel has in its
        // dependencies array this component with the relativePaths array. Find the relativePath of this dep-file
        // to get the correct destinationRelativePath. There is no other way to obtain this info.
        if (!this.componentFromModel) {
          throw new GeneralError(`Failed to resolve ${componentId.toString()} dependencies because the component is not in the model.
Try to run "bit import ${this.component.id.toString()} --objects" to get the component saved in the model`);
        }
        ({ componentId, destination, depFileRelative } = this.getDependencyPathsFromModel(
          componentId,
          depFile,
          rootDir
        ));
      } else if (!isSupportedExtension(depFile) && this.componentFromModel) {
        // unsupported files, such as binary files, don't have link files. instead, they have a
        // symlink (or sometimes a copy on Windows) of the dependency inside the component. to
        // check whether a file is a symlink to a dependency we loop through the
        // sourceRelativePaths of the dependency, if there is match, we use the data from the model
        const dependenciesFromModel = this.componentFromModel.getAllDependenciesCloned();
        const sourcePaths = dependenciesFromModel.getSourcesPaths();
        if (sourcePaths.includes(depFile)) {
          const dependencyFromModel = dependenciesFromModel.getBySourcePath(depFile);
          componentId = dependencyFromModel.id;
          ({ componentId, destination, depFileRelative } = this.getDependencyPathsFromModel(
            componentId,
            depFile,
            rootDir
          ));
        }
      }
    }

    return { componentId, depFileRelative, destination };
  }

  /**
   * this is a workaround for cases where an alias points to a package with dist.
   * normally, aliases are created for local directories.
   * they can be however useful when a source code can't be touched and `require` to one package
   * needs to be replaced with a `require` to a component. in that case, our options are:
   * 1) point the alias to the package name.
   * 2) point the alias to the relative directory of the imported component
   * the ideal solution is #1, however, it requires changes in the Tree structure, which should
   * allow "bits" to have more data, such as importSource.
   * here, we go option #2, the alias is a relative path to the component. however, when there is
   * dist directory, the resolved path contains the "dist", which doesn't exist in the ComponentMap,
   * the solution we take is to identify such cases, strip the dist, then try to find them again.
   */
  _getComponentIdFromCustomResolveToPackageWithDist(depFile: string): ?BitId {
    if (!depFile.includes('dist')) return null;
    const resolveModules = this.consumer.bitJson.resolveModules;
    if (!resolveModules || !resolveModules.aliases) return null;
    const foundAlias = Object.keys(resolveModules.aliases).find(alias =>
      depFile.startsWith(resolveModules.aliases[alias])
    );
    if (!foundAlias) return null;
    const newDepFile = depFile.replace(
      `${resolveModules.aliases[foundAlias]}/dist`,
      resolveModules.aliases[foundAlias]
    );
    return this.consumer.bitMap.getComponentIdByPath(newDepFile);
  }

  getDependencyPathsFromModel(componentId: BitId, depFile: PathLinux, rootDir: PathLinux) {
    const dependency = this.componentFromModel
      .getAllDependencies()
      .find(dep => dep.id.isEqualWithoutVersion(componentId));
    if (!dependency) {
      throw new GeneralError( // $FlowFixMe
        `the auto-generated file ${depFile} should be connected to ${componentId}, however, it's not part of the model dependencies of ${
          this.componentFromModel.id
        }`
      );
    }
    const isCompilerDependency = this.componentFromModel.compilerDependencies.getById(componentId);
    const isTesterDependency = this.componentFromModel.testerDependencies.getById(componentId);
    const isEnvDependency = isCompilerDependency || isTesterDependency;
    const isRelativeToConfigDir = Boolean(isEnvDependency && this.componentMap.configDir && this.componentMap.rootDir);
    const originallySource: PathLinux = this.getOriginallySourcePath(
      isRelativeToConfigDir,
      rootDir,
      depFile,
      isCompilerDependency
    );
    const relativePath: RelativePath = dependency.relativePaths.find(r => r.sourceRelativePath === originallySource);
    if (!relativePath) {
      throw new GeneralError(
        `unable to find ${originallySource} path in the dependencies relativePaths of ${this.componentFromModel.id}`
      );
    }
    return {
      componentId: dependency.id,
      destination: relativePath.destinationRelativePath,
      // in the case of isRelativeToConfigDir, sourceRelativePath should be relative to configDir
      depFileRelative: isRelativeToConfigDir ? originallySource : depFile
    };
  }

  getOriginallySourcePath(
    isRelativeToConfigDir: boolean,
    rootDir: PathLinux,
    depFile: PathLinux,
    isCompilerDependency: boolean
  ): PathLinux {
    if (isRelativeToConfigDir) {
      // find the sourceRelativePath relative to the configDir, not to the rootDir of the component
      const resolvedSource = path.resolve(rootDir, depFile);
      // @todo: use the new ConfigDir class that Gilad added once it is merged.
      const { compiler: compilerConfigDir, tester: testerConfigDir } = BitMap.parseConfigDir(
        this.componentMap.configDir,
        this.componentMap.rootDir
      );
      const configDir = isCompilerDependency ? compilerConfigDir : testerConfigDir;
      const absoluteConfigDir = this.consumer.toAbsolutePath(configDir);
      return pathRelativeLinux(absoluteConfigDir, resolvedSource);
    }
    return depFile;
  }

  processDepFiles(originFile: PathLinuxRelative, fileType: FileType) {
    const allDepsFiles = this.tree[originFile].files;
    if (!allDepsFiles || R.isEmpty(allDepsFiles)) return;
    allDepsFiles.forEach((depFile: FileObject) => {
      if (depFile.isLink) this.processLinkFile(originFile, depFile, fileType);
      else {
        this.processOneDepFile(originFile, depFile.file, depFile.importSpecifiers, undefined, fileType, depFile);
      }
    });
  }

  processOneDepFile(
    originFile: PathLinuxRelative,
    depFile: string,
    importSpecifiers?: ImportSpecifier[],
    linkFile?: string,
    fileType: FileType,
    depFileObject: FileObject
  ) {
    if (this.processedFiles.includes(depFile)) return;
    this.processedFiles.push(depFile);

    // if the dependency of an envFile is already included in the env files of the component, we're good
    if (fileType.isCompilerFile && this.compilerFiles.includes(depFile)) return;
    if (fileType.isTesterFile && this.testerFiles.includes(depFile)) return;

    const { componentId, depFileRelative, destination } = this.getComponentIdByDepFile(depFile);
    // the file dependency doesn't have any counterpart component. Add it to this.issues.untrackedDependencies
    if (!componentId) {
      if (this.issues.untrackedDependencies[originFile]) {
        this.issues.untrackedDependencies[originFile].push(depFileRelative);
      } else {
        this.issues.untrackedDependencies[originFile] = [depFileRelative];
      }
      return;
    }

    // happens when in the same component one file requires another one. In this case, there is
    // noting to do regarding the dependencies
    if (componentId.isEqual(this.componentId)) {
      if (depFileObject.isCustomResolveUsed) {
        this.component.customResolvedPaths.push({
          destinationPath: depFileObject.file,
          importSource: depFileObject.importSource
        });
      }
      return;
    }

    const depComponentMap = this.consumer.bitMap.getComponentIfExist(componentId);
    // found a dependency component. Add it to this.allDependencies.dependencies
    const depRootDir = depComponentMap ? depComponentMap.rootDir : undefined;
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
      depComponentMap &&
      !depFileObject.isCustomResolveUsed && // for custom resolve, the link is written in node_modules, so it doesn't matter
      ((depComponentMap.origin === COMPONENT_ORIGINS.IMPORTED &&
        this.componentMap.origin === COMPONENT_ORIGINS.AUTHORED) ||
        (depComponentMap.origin === COMPONENT_ORIGINS.AUTHORED &&
          this.componentMap.origin === COMPONENT_ORIGINS.IMPORTED))
    ) {
      // prevent author using relative paths for IMPORTED component (to avoid long paths)
      // also prevent adding AUTHORED component to an IMPORTED component using relative syntax. The reason is that when
      // this component is imported somewhere else, a link-file between the IMPORTED and the AUTHORED must be written
      // outside the component directory, which might override user files.
      if (this.issues.relativeComponents[originFile]) this.issues.relativeComponents[originFile].push(componentId);
      else this.issues.relativeComponents[originFile] = [componentId];
      return;
    }

    const allDependencies: Dependency[] = [
      ...this.allDependencies.dependencies,
      ...this.allDependencies.devDependencies,
      ...this.allDependencies.compilerDependencies,
      ...this.allDependencies.testerDependencies
    ];
    const existingDependency = this.getExistingDependency(allDependencies, componentId);
    if (existingDependency) {
      // it is another file of an already existing component. Just add the new path
      existingDependency.relativePaths.push(depsPaths);
    } else {
      this.pushToDependenciesArray(currentComponentsDeps, fileType);
    }
  }

  processLinkFile(originFile: PathLinuxRelative, linkFile: FileObject, fileType: FileType) {
    if (!linkFile.linkDependencies || R.isEmpty(linkFile.linkDependencies)) return;
    const nonLinkImportSpecifiers = [];
    linkFile.linkDependencies.forEach((dependency) => {
      const component = this.getComponentIdByDepFile(linkFile.file);
      if (component.componentId) {
        // the linkFile is already a component, no need to treat it differently than other depFile
        // aggregate all dependencies using the same linkFile and ultimately run processDepFile
        // with all importSpecifiers of that linkFile.
        // also, delete the linkFile attribute of importSpecifiers so then once the component is
        // imported and the link is generated, it won't be treated as a linkFile.
        dependency.importSpecifiers.map(a => delete a.linkFile);
        nonLinkImportSpecifiers.push(dependency.importSpecifiers);
      } else {
        this.processOneDepFile(
          originFile,
          dependency.file,
          dependency.importSpecifiers,
          linkFile.file,
          fileType,
          linkFile
        );
      }
    });
    if (nonLinkImportSpecifiers.length) {
      this.processOneDepFile(
        originFile,
        linkFile.file,
        R.flatten(nonLinkImportSpecifiers),
        undefined,
        fileType,
        linkFile
      );
    }
  }

  processBits(originFile: PathLinuxRelative, fileType: FileType) {
    const bits = this.tree[originFile].bits;
    if (!bits || R.isEmpty(bits)) return;
    bits.forEach((bitDep) => {
      const componentId: BitId = this.consumer.getComponentIdFromNodeModulesPath(bitDep, this.component.bindingPrefix);
      const getExistingId = (): ?BitId => {
        let existingId = this.consumer.bitmapIds.searchWithoutVersion(componentId);
        if (existingId) return existingId;

        // maybe the dependencies were imported as npm packages
        if (bitDep.startsWith('node_modules')) {
          // Add the root dir in case it exists (to make sure we search for the dependency package json in the correct place)
          const basePath = this.componentMap.rootDir
            ? path.join(this.consumerPath, this.componentMap.rootDir)
            : this.consumerPath;
          const depPath = path.join(basePath, bitDep);
          const packageJson = this.consumer.driver.driver.PackageJson.findPackage(depPath);
          if (packageJson) {
            const depVersion = packageJson.version;
            existingId = componentId.changeVersion(depVersion);
            return existingId;
          }
        }
        if (this.componentFromModel) {
          const modelDep = this.componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
          if (modelDep) return modelDep;
        }
        return null;
      };
      const existingId = getExistingId();
      if (existingId) {
        if (existingId.isEqual(this.componentId)) {
          // happens when one of the component files requires another using module path
          // no need to enter anything to the dependencies
          return;
        }
        const currentComponentsDeps: Dependency = { id: existingId, relativePaths: [] };
        const existingDependency = this.getExistingDependency(this.allDependencies.dependencies, existingId);
        if (!existingDependency) {
          this.pushToDependenciesArray(currentComponentsDeps, fileType);
        }
      } else {
        this.issues.missingBits[originFile]
          ? this.issues.missingBits[originFile].push(componentId)
          : (this.issues.missingBits[originFile] = [componentId]);
      }
    });
  }

  processPackages(originFile: PathLinuxRelative, fileType: FileType) {
    const packages = this.tree[originFile].packages;
    if (packages && !R.isEmpty(packages)) {
      if (fileType.isTestFile) {
        Object.assign(this.allPackagesDependencies.devPackageDependencies, packages);
      } else if (fileType.isCompilerFile) {
        Object.assign(this.allPackagesDependencies.compilerPackageDependencies, packages);
      } else if (fileType.isTesterFile) {
        Object.assign(this.allPackagesDependencies.testerPackageDependencies, packages);
      } else {
        Object.assign(this.allPackagesDependencies.packageDependencies, packages);
      }
    }
  }

  processMissing(originFile: PathLinuxRelative) {
    const missing = this.tree[originFile].missing;
    if (!missing) return;
    if (missing.files && !R.isEmpty(missing.files)) {
      if (this.issues.missingDependenciesOnFs[originFile]) {
        this.issues.missingDependenciesOnFs[originFile].concat(missing.files);
      } else this.issues.missingDependenciesOnFs[originFile] = missing.files;
    }
    if (missing.packages && !R.isEmpty(missing.packages)) {
      const customResolvedDependencies = this.findOriginallyCustomModuleResolvedDependencies(missing.packages);
      if (customResolvedDependencies) {
        Object.keys(customResolvedDependencies).forEach((missingPackage) => {
          const componentId = customResolvedDependencies[missingPackage].toString();
          if (this.issues.missingCustomModuleResolutionLinks[originFile]) {
            this.issues.missingCustomModuleResolutionLinks[originFile].push(componentId);
          } else this.issues.missingCustomModuleResolutionLinks[originFile] = [componentId];
        });
      }
      const missingPackages = customResolvedDependencies
        ? R.difference(missing.packages, Object.keys(customResolvedDependencies))
        : missing.packages;

      if (!R.isEmpty(missingPackages)) {
        if (this.issues.missingPackagesDependenciesOnFs[originFile]) {
          this.issues.missingPackagesDependenciesOnFs[originFile].concat(missing.packages);
        } else this.issues.missingPackagesDependenciesOnFs[originFile] = missing.packages;
      }
    }

    if (missing.bits && !R.isEmpty(missing.bits)) {
      missing.bits.forEach((missingBit) => {
        const componentId = this.consumer.getComponentIdFromNodeModulesPath(missingBit, this.component.bindingPrefix);
        // todo: a component might be on bit.map but not on the FS, yet, it's not about missing links.
        if (this.consumer.bitMap.getBitIdIfExist(componentId, { ignoreVersion: true })) {
          if (this.issues.missingLinks[originFile]) this.issues.missingLinks[originFile].push(componentId);
          else this.issues.missingLinks[originFile] = [componentId];
        } else if (this.issues.missingComponents[originFile]) {
          this.issues.missingComponents[originFile].push(componentId);
        } else {
          this.issues.missingComponents[originFile] = [componentId];
        }
      });
    }
  }

  processErrors(originFile: PathLinuxRelative) {
    const error = this.tree[originFile].error;
    if (!error) return;
    logger.errorAndAddBreadCrumb(
      'dependency-resolver.processErrors',
      'got an error from the driver while resolving dependencies'
    );
    logger.error(error);
    // $FlowFixMe error.code is set when it comes from bit-javascript, otherwise, it's undefined and treated as resolve-error
    if (error.code === 'PARSING_ERROR') this.issues.parseErrors[originFile] = error.message;
    else this.issues.resolveErrors[originFile] = error.message;
  }

  /**
   * currently the only unidentified packages being process are the ones coming from custom-modules-resolution.
   * assuming the author used custom-resolution, which enable using non-relative import syntax,
   * for example, requiring the file 'src/utils/is-string' from anywhere as require('utils/is-string');
   * now, when the component is imported, the driver recognizes 'utils/is-string' as a package,
   * because it's not relative.
   * the goal here is to use the 'package' the driver found and match it with one of the
   * dependencies from the model. In the example above, we might find in the model, a dependency
   * is-string with importSource of 'utils/is-string'.
   * Once a match is found, copy the relativePaths from the model.
   */
  processUnidentifiedPackages(originFile: PathLinuxRelative, fileType: FileType) {
    const unidentifiedPackages = this.tree[originFile].unidentifiedPackages;
    if (!unidentifiedPackages) return;
    if (!this.componentFromModel) return; // not relevant, the component is not imported
    const getDependencies = (): Dependencies => {
      if (fileType.isTestFile) return this.componentFromModel.devDependencies;
      if (fileType.isCompilerFile) return this.componentFromModel.compilerDependencies;
      if (fileType.isTesterFile) return this.componentFromModel.testerDependencies;
      return this.componentFromModel.dependencies;
    };
    const dependencies: Dependencies = getDependencies();
    if (dependencies.isEmpty()) return;
    const importSourceMap = dependencies.getCustomResolvedData();
    if (R.isEmpty(importSourceMap)) return;
    const clonedDependencies = new Dependencies(dependencies.getClone());
    unidentifiedPackages.forEach((unidentifiedPackage) => {
      const packageLinuxFormat = pathNormalizeToLinux(unidentifiedPackage);
      const packageWithNoNodeModules = packageLinuxFormat.replace('node_modules/', '');
      const foundImportSource = Object.keys(importSourceMap).find(importSource =>
        packageWithNoNodeModules.startsWith(importSource)
      );
      if (foundImportSource) {
        const dependencyId: BitId = importSourceMap[foundImportSource];
        const existingDependency = this.getExistingDependency(this.allDependencies.dependencies, dependencyId);
        const existingDevDependency = this.getExistingDependency(this.allDependencies.devDependencies, dependencyId);
        const existingCompilerDependency = this.getExistingDependency(
          this.allDependencies.compilerDependencies,
          dependencyId
        );
        const existingTesterDependency = this.getExistingDependency(
          this.allDependencies.testerDependencies,
          dependencyId
        );
        const currentComponentDeps = {
          id: dependencyId,
          // $FlowFixMe
          relativePaths: clonedDependencies.getById(dependencyId).relativePaths
        };
        if (fileType.isTestFile && !existingDevDependency) {
          this.allDependencies.devDependencies.push(currentComponentDeps);
        } else if (fileType.isCompilerFile && !existingCompilerDependency) {
          this.allDependencies.compilerDependencies.push(currentComponentDeps);
        } else if (fileType.isTesterFile && !existingTesterDependency) {
          this.allDependencies.testerDependencies.push(currentComponentDeps);
        } else if (!fileType.isTestFile && !fileType.isCompilerFile && !fileType.isTesterFile && !existingDependency) {
          this.allDependencies.dependencies.push(currentComponentDeps);
        }
      }
    });
  }

  pushToDependenciesArray(currentComponentsDeps: Dependency, fileType: FileType) {
    if (fileType.isTestFile) {
      this.allDependencies.devDependencies.push(currentComponentsDeps);
    } else if (fileType.isCompilerFile) {
      this.allDependencies.compilerDependencies.push(currentComponentsDeps);
    } else if (fileType.isTesterFile) {
      this.allDependencies.testerDependencies.push(currentComponentsDeps);
    } else {
      this.allDependencies.dependencies.push(currentComponentsDeps);
    }
  }

  /**
   * Remove the dependencies which appear both in dev and regular deps from the dev
   * Because if a dependency is both dev dependency and regular dependency it should be treated as regular one
   * Apply for both packages and components dependencies
   */
  removeDevAndEnvDepsIfTheyAlsoRegulars() {
    // remove dev and env packages that are also regular packages
    const getNotRegularPackages = packages =>
      R.difference(R.keys(packages), R.keys(this.allPackagesDependencies.packageDependencies));
    this.allPackagesDependencies.devPackageDependencies = R.pick(
      getNotRegularPackages(this.allPackagesDependencies.devPackageDependencies),
      this.allPackagesDependencies.devPackageDependencies
    );
    this.allPackagesDependencies.compilerPackageDependencies = R.pick(
      getNotRegularPackages(this.allPackagesDependencies.compilerPackageDependencies),
      this.allPackagesDependencies.compilerPackageDependencies
    );
    this.allPackagesDependencies.testerPackageDependencies = R.pick(
      getNotRegularPackages(this.allPackagesDependencies.testerPackageDependencies),
      this.allPackagesDependencies.testerPackageDependencies
    );

    // remove dev and env dependencies that are also regular dependencies
    const componentDepsIds = new BitIds(...this.allDependencies.dependencies.map(c => c.id));
    this.allDependencies.devDependencies = this.allDependencies.devDependencies.filter(
      d => !componentDepsIds.has(d.id)
    );
    this.allDependencies.compilerDependencies = this.allDependencies.compilerDependencies.filter(
      d => !componentDepsIds.has(d.id)
    );
    this.allDependencies.testerDependencies = this.allDependencies.testerDependencies.filter(
      d => !componentDepsIds.has(d.id)
    );
  }

  /**
   * given missing packages name, find whether they were dependencies with custom-resolve before.
   */
  findOriginallyCustomModuleResolvedDependencies(packages: string[]): ?Object {
    if (!packages) return undefined;
    if (!this.componentFromModel) return undefined; // not relevant, the component is not imported
    const dependencies: Dependencies = new Dependencies(this.componentFromModel.getAllDependencies());
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
  }

  // when env dependencies are not sent to the dependency-resolver, they should be copied from the model
  copyEnvDependenciesFromModelIfNeeded() {
    if (!this.componentFromModel) return;
    if (!shouldProcessEnvDependencies(this.component.compiler)) {
      this.allDependencies.compilerDependencies = this.componentFromModel.compilerDependencies.get();
      this.allPackagesDependencies.compilerPackageDependencies = this.componentFromModel.compilerPackageDependencies;
    }
    if (!shouldProcessEnvDependencies(this.component.tester)) {
      this.allDependencies.testerDependencies = this.componentFromModel.testerDependencies.get();
      this.allPackagesDependencies.testerPackageDependencies = this.componentFromModel.testerPackageDependencies;
    }
  }

  combineIssues() {
    Object.keys(this.issues.missingBits).forEach((missingBit) => {
      if (this.issues.missingComponents[missingBit]) {
        this.issues.missingComponents[missingBit] = this.issues.missingComponents[missingBit].concat(
          this.issues.missingBits[missingBit]
        );
      } else {
        this.issues.missingComponents[missingBit] = this.issues.missingBits[missingBit];
      }
    });
  }

  removeEmptyIssues() {
    const notEmpty = item => !R.isEmpty(item);
    this.issues = R.filter(notEmpty, this.issues);
  }

  getExistingDependency(dependencies: Dependency[], id: BitId): ?Dependency {
    return dependencies.find(d => d.id.isEqual(id));
  }

  setCompilerFiles() {
    const compilerFiles = shouldProcessEnvDependencies(this.component.compiler) ? this.component.compiler.files : [];
    this.compilerFiles = this.getRelativeEnvFiles(compilerFiles);
  }

  setTesterFiles() {
    const testerFiles = shouldProcessEnvDependencies(this.component.tester) ? this.component.tester.files : [];
    this.testerFiles = this.getRelativeEnvFiles(testerFiles);
  }

  getRelativeEnvFiles(files: Object[]): PathLinux[] {
    const getPathsRelativeToComponentRoot = () => {
      const rootDirAbsolute = this.consumer.toAbsolutePath(this.componentMap.getRootDir());
      return files.map((file) => {
        const envAbsolute = file.path;
        return path.relative(rootDirAbsolute, envAbsolute);
      });
    };
    return getPathsRelativeToComponentRoot().map(file => pathNormalizeToLinux(file));
  }
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
        logger.errorAndAddBreadCrumb(
          'dependency-resolver.findPeerDependencies',
          'Failed reading the project package.json at {packageJsonLocation}. Error Message: {message}',
          { packageJsonLocation, message: err.message }
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
function shouldProcessEnvDependencies(env: EnvExtension): boolean {
  return Boolean(env && env.files && env.files.every(file => !file.fromModel));
}
