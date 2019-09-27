/** @flow */
import path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import * as RA from 'ramda-adjunct';
import { COMPONENT_ORIGINS, DEPENDENCIES_FIELDS } from '../../../../constants';
import ComponentMap from '../../../bit-map/component-map';
import { BitId, BitIds } from '../../../../bit-id';
import type Component from '../../../component/consumer-component';
import { Driver } from '../../../../driver';
import { pathNormalizeToLinux, pathRelativeLinux, getExt } from '../../../../utils';
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
import OverridesDependencies from './overrides-dependencies';
import ShowDoctorError from '../../../../error/show-doctor-error';
import PackageJsonFile from '../../package-json-file';

export type AllDependencies = {
  dependencies: Dependency[],
  devDependencies: Dependency[],
  compilerDependencies: Dependency[],
  testerDependencies: Dependency[]
};

export type AllPackagesDependencies = {
  packageDependencies: ?Object,
  devPackageDependencies: ?Object,
  compilerPackageDependencies: ?Object,
  testerPackageDependencies: ?Object,
  peerPackageDependencies: ?Object
};

export type FileType = {
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
  overridesDependencies: OverridesDependencies;
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
      testerPackageDependencies: {},
      peerPackageDependencies: {}
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
    this.overridesDependencies = new OverridesDependencies(component, consumer);
  }

  setTree(tree: Tree) {
    this.tree = tree;
    // console.log(JSON.stringify(tree, null, 4)); // uncomment to easily watch the tree received from bit-javascript
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
  async loadDependenciesForComponent(
    bitDir: string,
    cacheResolvedDependencies: Object,
    cacheProjectAst: ?Object
  ): Promise<Component> {
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
        this.consumer.config.resolveModules,
        cacheResolvedDependencies,
        cacheProjectAst
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
    if (shouldProcessEnvDependencies(this.component.compiler)) {
      this.component.compilerPackageDependencies.devDependencies = R.merge(
        this.allPackagesDependencies.compilerPackageDependencies,
        this.component.compilerPackageDependencies.devDependencies
      );
    }
    if (shouldProcessEnvDependencies(this.component.tester)) {
      this.component.testerPackageDependencies.devDependencies = R.merge(
        this.allPackagesDependencies.testerPackageDependencies,
        this.component.testerPackageDependencies.devDependencies
      );
    }

    this.component.peerPackageDependencies = this.allPackagesDependencies.peerPackageDependencies;
    if (!R.isEmpty(this.issues)) this.component.issues = this.issues;
    this.component.manuallyRemovedDependencies = this.overridesDependencies.manuallyRemovedDependencies;
    this.component.manuallyAddedDependencies = this.overridesDependencies.manuallyAddedDependencies;

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
   *
   * When a dependency is found in a regular (implementation) file, it goes to `dependencies`. If
   * it found on a test file, it goes to `devDependencies`. Same goes for environment dependencies,
   * such ad `compilerDependencies` and `testerDependencies`.
   * Similarly, when a package is found in a regular file, it goes to `packageDependencies`. When
   * if found in a test file, it goes to `devPackageDependencies`.
   * An exception for the above is when a package is required in a regular or test file but is also
   * mentioned in the `package.json` file as a peerDependency, in that case, the package is added
   * to `peerPackageDependencies` and removed from other places. Unless this package is overridden
   * and marked as ignored in the consumer or component config file.
   */
  populateDependencies(files: string[], testsFiles: string[]) {
    files.forEach((file: string) => {
      const fileType: FileType = {
        isTestFile: R.contains(file, testsFiles),
        isCompilerFile: R.contains(file, this.compilerFiles),
        isTesterFile: R.contains(file, this.testerFiles)
      };
      this.throwForNonExistFile(file);
      if (this.overridesDependencies.shouldIgnoreFile(file, fileType)) {
        return;
      }
      this.processMissing(file, fileType);
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
    this.populatePeerPackageDependencies();
    this.manuallyAddDependencies();
  }

  throwForNonExistFile(file: string) {
    if (!this.tree[file]) {
      throw new Error(
        `DependencyResolver: a file "${file}" was not returned from the driver, its dependencies are unknown`
      );
    }
  }

  manuallyAddDependencies() {
    const packageJson = this._getPackageJson();
    const dependencies = this.overridesDependencies.getDependenciesToAddManually(packageJson, this.allDependencies);
    if (!dependencies) return;
    const { components, packages } = dependencies;
    DEPENDENCIES_FIELDS.forEach((depField) => {
      if (components[depField] && components[depField].length) {
        // $FlowFixMe
        components[depField].forEach(id => this.allDependencies[depField].push({ id, relativePaths: [] }));
      }
      if (packages[depField] && !R.isEmpty(packages[depField])) {
        Object.assign(this.allPackagesDependencies[this._pkgFieldMapping(depField)], packages[depField]);
      }
    });
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
    const resolveModules = this.consumer.config.resolveModules;
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
      throw new ShowDoctorError( // $FlowFixMe
        `the auto-generated file ${depFile} should be connected to ${componentId}, however, it's not part of the model dependencies of ${this.componentFromModel.id}`
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
      throw new ShowDoctorError(
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
      if (this.overridesDependencies.shouldIgnoreFile(depFile.file, fileType)) return;
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
    // We don't just return because different files of the component might import different things from the depFile
    // See more info here: https://github.com/teambit/bit/issues/1796
    if (!this.processedFiles.includes(depFile)) {
      this.processedFiles.push(depFile);
    }

    // if the dependency of an envFile is already included in the env files of the component, we're good
    if (fileType.isCompilerFile && this.compilerFiles.includes(depFile)) return;
    if (fileType.isTesterFile && this.testerFiles.includes(depFile)) return;

    const { componentId, depFileRelative, destination } = this.getComponentIdByDepFile(depFile);
    // the file dependency doesn't have any counterpart component. Add it to this.issues.untrackedDependencies
    if (!componentId) {
      if (this.tree[depFile] && this.tree[depFile].missing && this.tree[depFile].missing.bits) {
        // this depFile is a dependency link and this dependency is missing
        this._addToMissingComponentsIfNeeded(this.tree[depFile].missing.bits, originFile, fileType);
        return;
      }
      this._pushToUntrackDependenciesIssues(originFile, depFileRelative);
      return;
    }
    if (this.overridesDependencies.shouldIgnoreComponent(componentId, fileType)) {
      // we can't support it because on the imported side, we don't know to convert the relative path
      // to the component name, as it won't have the component installed
      throw new GeneralError(`unable to ignore "${componentId.toString()}" dependency of "${this.componentId.toString()}" by using ignore components syntax because the component is required with relative path.
either, use the ignore file syntax or change the require statement to have a module path`);
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
      importSpecifiers.map((importSpecifier) => {
        if (importSpecifier.linkFile) delete importSpecifier.linkFile.exported;
        if (importSpecifier.mainFile) delete importSpecifier.mainFile.exported;
      });
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
      this._pushToRelativeComponentsIssues(originFile, componentId);
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
      const existingDepRelativePaths = this.getExistingDepRelativePaths(existingDependency, depsPaths);
      if (!existingDepRelativePaths) {
        // it is another file of an already existing component. Just add the new path
        existingDependency.relativePaths.push(depsPaths);
        return;
      }
      // The dep path already exists but maybe this dep-file has more importSpecifiers
      if (depsPaths.importSpecifiers) {
        // add them to the existing dep
        if (!existingDepRelativePaths.importSpecifiers) {
          existingDepRelativePaths.importSpecifiers = [...depsPaths.importSpecifiers];
        } else {
          // both have importSpecifiers
          const nonExistingImportSpecifiers = this.getDiffSpecifiers(
            existingDepRelativePaths.importSpecifiers,
            depsPaths.importSpecifiers
          );
          existingDepRelativePaths.importSpecifiers.push(...nonExistingImportSpecifiers);
        }
      }
      // Handle cases when the first dep paths are not custom resolved and the new one is
      if (depsPaths.isCustomResolveUsed && !existingDepRelativePaths.isCustomResolveUsed) {
        existingDepRelativePaths.isCustomResolveUsed = depsPaths.isCustomResolveUsed;
      }
      if (depsPaths.importSource && !existingDepRelativePaths.importSource) {
        existingDepRelativePaths.importSource = depsPaths.importSource;
      }
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

  /**
   * process require/import of Bit components where the require statement is not a relative path
   * but a module path, such as `require('@bit/bit.envs/compiler/babel');`
   */
  processBits(originFile: PathLinuxRelative, fileType: FileType) {
    const bits = this.tree[originFile].bits;
    if (!bits || R.isEmpty(bits)) return;
    bits.forEach((bitDep) => {
      const componentId: BitId = this.consumer.getComponentIdFromNodeModulesPath(bitDep, this.component.bindingPrefix);
      if (this.overridesDependencies.shouldIgnoreComponent(componentId, fileType)) return;
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
        this._pushToMissingBitsIssues(originFile, componentId);
      }
    });
  }

  processPackages(originFile: PathLinuxRelative, fileType: FileType) {
    const getPackages = (): ?Object => {
      const packages = this.tree[originFile].packages;
      if (RA.isNilOrEmpty(packages)) return null;
      const shouldBeIncluded = (pkgVersion, pkgName) =>
        !this.overridesDependencies.shouldIgnorePackage(pkgName, fileType);
      return R.pickBy(shouldBeIncluded, packages);
    };
    const packages = getPackages();
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
      this._addTypesPackagesForTypeScript(packages, originFile);
    }
  }

  processMissing(originFile: PathLinuxRelative, fileType: FileType) {
    const missing = this.tree[originFile].missing;
    if (!missing) return;
    const processMissingFiles = () => {
      if (RA.isNilOrEmpty(missing.files)) return;
      const absOriginFile = this.consumer.toAbsolutePath(originFile);
      const missingFiles = missing.files.filter((missingFile) => {
        // convert from importSource (the string inside the require/import call) to the path relative to consumer
        const resolvedPath = path.resolve(path.dirname(absOriginFile), missingFile);
        const relativeToConsumer = this.consumer.getPathRelativeToConsumer(resolvedPath);
        return !this.overridesDependencies.shouldIgnoreFile(relativeToConsumer, fileType);
      });
      if (R.isEmpty(missingFiles)) return;
      this._pushToMissingDependenciesOnFs(originFile, missingFiles);
    };
    const processMissingPackages = () => {
      if (RA.isNilOrEmpty(missing.packages)) return;
      const missingPackages = missing.packages.filter(
        pkg => !this.overridesDependencies.shouldIgnorePackage(pkg, fileType)
      );
      if (R.isEmpty(missingPackages)) return;
      const customResolvedDependencies = this.findOriginallyCustomModuleResolvedDependencies(missingPackages);
      if (customResolvedDependencies) {
        Object.keys(customResolvedDependencies).forEach((missingPackage) => {
          const componentId = customResolvedDependencies[missingPackage].toString();
          this._pushToMissingCustomModuleIssues(originFile, componentId);
        });
      }
      const missingPackagesWithoutCustomResolved = customResolvedDependencies
        ? R.difference(missingPackages, Object.keys(customResolvedDependencies))
        : missingPackages;

      if (!R.isEmpty(missingPackagesWithoutCustomResolved)) {
        this._pushToMissingPackagesDependenciesIssues(originFile, missingPackages);
      }
    };
    const processMissingComponents = () => {
      if (RA.isNilOrEmpty(missing.bits)) return;
      this._addToMissingComponentsIfNeeded(missing.bits, originFile, fileType);
    };
    processMissingFiles();
    processMissingPackages();
    processMissingComponents();
  }

  _addToMissingComponentsIfNeeded(missingComponents: string[], originFile: string, fileType: FileType) {
    missingComponents.forEach((missingBit) => {
      const componentId: BitId = this.consumer.getComponentIdFromNodeModulesPath(
        missingBit,
        this.component.bindingPrefix
      );
      if (this.overridesDependencies.shouldIgnoreComponent(componentId, fileType)) return;
      // todo: a component might be on bit.map but not on the FS, yet, it's not about missing links.
      if (this.consumer.bitMap.getBitIdIfExist(componentId, { ignoreVersion: true })) {
        this._pushToMissingLinksIssues(originFile, componentId);
      } else {
        this._pushToMissingComponentsIssues(originFile, componentId);
      }
    });
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
    }
    if (!shouldProcessEnvDependencies(this.component.tester)) {
      this.allDependencies.testerDependencies = this.componentFromModel.testerDependencies.get();
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

  getExistingDepRelativePaths(dependency: Dependency, relativePath: RelativePath) {
    if (!dependency.relativePaths || R.isEmpty(dependency.relativePaths)) return null;
    return dependency.relativePaths.find(
      paths =>
        paths.sourceRelativePath === relativePath.sourceRelativePath &&
        paths.destinationRelativePath === relativePath.destinationRelativePath
    );
  }

  getDiffSpecifiers(originSpecifiers: ImportSpecifier[], targetSpecifiers: ImportSpecifier[]) {
    const cmp = (specifier1, specifier2) => specifier1.mainFile.name === specifier2.mainFile.name;
    return R.differenceWith(cmp, targetSpecifiers, originSpecifiers);
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

  /**
   * For author, the peer-dependencies are set in the root package.json
   * For imported components, we don't want to change the peerDependencies of the author, unless
   * we're certain the user intent to do so. Therefore, we ignore the root package.json and look for
   * the package.json in the component's directory.
   */
  populatePeerPackageDependencies(): void {
    const getPeerDependencies = (): Object => {
      const packageJson = this._getPackageJson();
      if (packageJson && packageJson.peerDependencies) return packageJson.peerDependencies;
      return {};
    };
    const projectPeerDependencies = getPeerDependencies();
    const peerPackages = {};
    if (R.isEmpty(projectPeerDependencies)) return;

    // check whether the peer-dependencies was actually require in the code. if so, remove it from
    // the packages/dev-packages and add it as a peer-package.
    // if it was not required in the code, don't add it to the peerPackages
    Object.keys(projectPeerDependencies).forEach((pkg) => {
      if (this.overridesDependencies.shouldIgnorePeerPackage(pkg)) return;
      ['packageDependencies', 'devPackageDependencies'].forEach((field) => {
        if (Object.keys(this.allPackagesDependencies[field]).includes(pkg)) {
          delete this.allPackagesDependencies[field][pkg];
          peerPackages[pkg] = projectPeerDependencies[pkg];
        }
      });
    });
    this.allPackagesDependencies.peerPackageDependencies = peerPackages;
  }

  /**
   * returns `package.json` of the component when it's imported, or `package.json` of the workspace
   * when it's authored.
   */
  _getPackageJson(): ?Object {
    const componentMap = this.component.componentMap;
    // $FlowFixMe
    const isAuthor = componentMap.origin === COMPONENT_ORIGINS.AUTHORED;
    if (isAuthor) {
      return this.consumer.config.packageJsonObject;
    }
    if (this.component.packageJsonFile) {
      return this.component.packageJsonFile.packageJsonObject;
    }
    if (this.componentFromModel) {
      // a component is imported but the package.json file is missing or never written
      // read the values from the model
      // $FlowFixMe
      const packageJson = PackageJsonFile.createFromComponent(componentMap.rootDir, this.componentFromModel);
      return packageJson.packageJsonObject;
    }
    return null;
  }

  /**
   * when requiring packages in typescript, sometimes there are the types packages with the same
   * name, which the user probably wants as well. for example, requiring `foo` package, will also
   * add `@types/foo` to the devDependencies if it has been found in the user `package.json` file.
   *
   * ideally this should be in bit-javascript. however, the decision where to put these `@types`
   * packages (dependencies/devDependencies) is done here according to the user `package.json`
   * and can't be done there because the `Tree` we get from bit-javascript doesn't have this
   * distinction.
   */
  _addTypesPackagesForTypeScript(packages: Object, originFile: PathLinuxRelative): void {
    const isTypeScript = getExt(originFile) === 'ts' || getExt(originFile) === 'tsx';
    if (!isTypeScript) return;
    const packageJson = this._getPackageJson();
    if (!packageJson) return;
    const addIfNeeded = (depField: string, packageName: string) => {
      if (!packageJson[depField]) return;
      const typesPackage = `@types/${packageName}`;
      if (!packageJson[depField][typesPackage]) return;
      Object.assign(this.allPackagesDependencies[this._pkgFieldMapping(depField)], {
        [typesPackage]: packageJson[depField][typesPackage]
      });
    };
    Object.keys(packages).forEach((packageName) => {
      DEPENDENCIES_FIELDS.forEach(depField => addIfNeeded(depField, packageName));
    });
  }

  _pkgFieldMapping(field: string) {
    switch (field) {
      case 'dependencies':
        return 'packageDependencies';
      case 'devDependencies':
        return 'devPackageDependencies';
      case 'peerDependencies':
        return 'peerPackageDependencies';
      default:
        throw new Error(`${field} is not recognized`);
    }
  }

  _pushToUntrackDependenciesIssues(originFile, depFileRelative) {
    if (this.issues.untrackedDependencies[originFile]) {
      this.issues.untrackedDependencies[originFile].push(depFileRelative);
    } else {
      this.issues.untrackedDependencies[originFile] = [depFileRelative];
    }
  }
  _pushToRelativeComponentsIssues(originFile, componentId) {
    if (this.issues.relativeComponents[originFile]) {
      this.issues.relativeComponents[originFile].push(componentId);
    } else {
      this.issues.relativeComponents[originFile] = [componentId];
    }
  }
  _pushToMissingBitsIssues(originFile: PathLinuxRelative, componentId: BitId) {
    this.issues.missingBits[originFile]
      ? this.issues.missingBits[originFile].push(componentId)
      : (this.issues.missingBits[originFile] = [componentId]);
  }
  _pushToMissingDependenciesOnFs(originFile: PathLinuxRelative, missingFiles: string[]) {
    if (this.issues.missingDependenciesOnFs[originFile]) {
      this.issues.missingDependenciesOnFs[originFile].concat(missingFiles);
    } else this.issues.missingDependenciesOnFs[originFile] = missingFiles;
  }
  _pushToMissingPackagesDependenciesIssues(originFile: PathLinuxRelative, missingPackages: string[]) {
    if (this.issues.missingPackagesDependenciesOnFs[originFile]) {
      this.issues.missingPackagesDependenciesOnFs[originFile].concat(missingPackages);
    } else this.issues.missingPackagesDependenciesOnFs[originFile] = missingPackages;
  }
  _pushToMissingCustomModuleIssues(originFile: PathLinuxRelative, componentId: BitId) {
    if (this.issues.missingCustomModuleResolutionLinks[originFile]) {
      this.issues.missingCustomModuleResolutionLinks[originFile].push(componentId);
    } else this.issues.missingCustomModuleResolutionLinks[originFile] = [componentId];
  }
  _pushToMissingLinksIssues(originFile: PathLinuxRelative, componentId: BitId) {
    if (this.issues.missingLinks[originFile]) {
      this.issues.missingLinks[originFile].push(componentId);
    } else {
      this.issues.missingLinks[originFile] = [componentId];
    }
  }
  _pushToMissingComponentsIssues(originFile: PathLinuxRelative, componentId: BitId) {
    if (this.issues.missingComponents[originFile]) {
      this.issues.missingComponents[originFile].push(componentId);
    } else {
      this.issues.missingComponents[originFile] = [componentId];
    }
  }
}

/**
 * if the component doesn't have the env files written on the filesystem there is nothing to pass
 * to the dependencyResolver
 */
function shouldProcessEnvDependencies(env: EnvExtension): boolean {
  return Boolean(env && env.files && env.files.every(file => !file.fromModel));
}
