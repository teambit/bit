import * as path from 'path';
import fs from 'fs-extra';
import R from 'ramda';
import { isNilOrEmpty } from 'ramda-adjunct';
import semver from 'semver';
import { IssuesList, IssuesClasses } from '@teambit/component-issues';
import { Dependency } from '..';
import { BitId, BitIds } from '../../../../bit-id';
import { COMPONENT_ORIGINS, DEFAULT_DIST_DIRNAME, DEPENDENCIES_FIELDS } from '../../../../constants';
import Consumer from '../../../../consumer/consumer';
import GeneralError from '../../../../error/general-error';
import ShowDoctorError from '../../../../error/show-doctor-error';
import { isSupportedExtension } from '../../../../links/link-content';
import logger from '../../../../logger/logger';
import { getExt, pathNormalizeToLinux, pathRelativeLinux } from '../../../../utils';
import { packageNameToComponentId } from '../../../../utils/bit/package-name-to-component-id';
import { PathLinux, PathLinuxRelative, PathOsBased } from '../../../../utils/path';
import ComponentMap from '../../../bit-map/component-map';
import Component from '../../../component/consumer-component';
import PackageJsonFile from '../../package-json-file';
import Dependencies from '../dependencies';
import { RelativePath } from '../dependency';
import { getDependencyTree } from '../files-dependency-builder';
import { FileObject, ImportSpecifier, DependenciesTree } from '../files-dependency-builder/types/dependency-tree-type';
import OverridesDependencies from './overrides-dependencies';
import { ResolvedPackageData } from '../../../../utils/packages';
import { DependenciesData } from './dependencies-data';
import { packageToDefinetlyTyped } from './package-to-definetly-typed';
import { ExtensionDataList } from '../../../config';

export type AllDependencies = {
  dependencies: Dependency[];
  devDependencies: Dependency[];
};

export type AllPackagesDependencies = {
  packageDependencies: Record<string, any> | null | undefined;
  devPackageDependencies: Record<string, any> | null | undefined;
  compilerPackageDependencies: Record<string, any> | null | undefined;
  testerPackageDependencies: Record<string, any> | null | undefined;
  peerPackageDependencies: Record<string, any> | null | undefined;
};

export type FileType = {
  isTestFile: boolean;
};

export type DebugDependencies = {
  components: DebugComponentsDependency[];
  unidentifiedPackages?: string[];
};

export type DebugComponentsDependency = {
  id: BitId;
  importSource?: string;
  dependencyPackageJsonPath?: string;
  dependentPackageJsonPath?: string;
  // can be resolved here or can be any one of the strategies in dependencies-version-resolver
  versionResolvedFrom?: 'DependencyPkgJson' | 'DependentPkgJson' | 'BitMap' | 'Model' | string;
  version?: string;
  componentIdResolvedFrom?: 'DependencyPkgJson' | 'DependencyPath' | 'LegacyUnknown';
  packageName?: string;
};

type WorkspacePolicyGetter = () => {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type HarmonyEnvPeersPolicyGetter = (configuredExtensions: ExtensionDataList) => Promise<{ [name: string]: string }>;

export default class DependencyResolver {
  component: Component;
  consumer: Consumer;
  componentId: BitId;
  componentMap: ComponentMap;
  componentFromModel: Component;
  consumerPath: PathOsBased;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  tree: DependenciesTree;
  allDependencies: AllDependencies;
  allPackagesDependencies: AllPackagesDependencies;
  issues: IssuesList;
  coreAspects: string[] = [];
  processedFiles: string[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  compilerFiles: PathLinux[];
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  testerFiles: PathLinux[];
  overridesDependencies: OverridesDependencies;
  debugDependenciesData: DebugDependencies;

  static getWorkspacePolicy: WorkspacePolicyGetter;
  static registerWorkspacePolicyGetter(func: WorkspacePolicyGetter) {
    this.getWorkspacePolicy = func;
  }

  static getHarmonyEnvPeersPolicy: HarmonyEnvPeersPolicyGetter;
  static registerHarmonyEnvPeersPolicyGetter(func: HarmonyEnvPeersPolicyGetter) {
    this.getHarmonyEnvPeersPolicy = func;
  }

  static getDepResolverAspectName: () => string;
  static getCoreAspectsPackagesAndIds: () => Record<string, string>;
  static getDevFiles: (component: Component) => Promise<string[]>;

  constructor(component: Component, consumer: Consumer) {
    this.component = component;
    this.consumer = consumer;
    this.componentId = component.id;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentMap = this.component.componentMap;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentFromModel = this.component.componentFromModel;
    this.consumerPath = this.consumer.getPath();
    this.allDependencies = {
      dependencies: [],
      devDependencies: [],
    };
    this.allPackagesDependencies = {
      packageDependencies: {},
      devPackageDependencies: {},
      compilerPackageDependencies: {},
      testerPackageDependencies: {},
      peerPackageDependencies: {},
    };
    this.processedFiles = [];
    this.issues = component.issues;
    this.setLegacyInsideHarmonyIssue();
    this.overridesDependencies = new OverridesDependencies(component, consumer);
    this.debugDependenciesData = { components: [] };
  }

  setTree(tree: DependenciesTree) {
    this.tree = tree;
    // console.log(JSON.stringify(tree, null, 4)); // uncomment to easily watch the tree received from bit-javascript
  }

  /**
   * Resolve components and packages dependencies for a component.
   * This method should NOT have any side-effect on the component. the DependenciesLoader class is
   * responsible for saving this data on the component object.
   *
   * The process is as follows:
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
  async getDependenciesData(
    cacheResolvedDependencies: Record<string, any>,
    cacheProjectAst: Record<string, any> | undefined
  ): Promise<DependenciesData> {
    const componentDir = this.componentMap?.rootDir
      ? path.join(this.consumerPath, this.componentMap?.rootDir)
      : this.consumerPath;
    const { nonTestsFiles, testsFiles } = this.componentMap.getFilesGroupedByBeingTests();
    const allFiles = [...nonTestsFiles, ...testsFiles];
    // find the dependencies (internal files and packages) through automatic dependency resolution
    const dependenciesTree = await getDependencyTree({
      componentDir,
      workspacePath: this.consumerPath,
      filePaths: allFiles,
      bindingPrefix: this.component.bindingPrefix,
      isLegacyProject: this.consumer.isLegacy,
      resolveModulesConfig: this.consumer.config._resolveModules,
      visited: cacheResolvedDependencies,
      cacheProjectAst,
    });
    // we have the files dependencies, these files should be components that are registered in bit.map. Otherwise,
    // they are referred as "untracked components" and the user should add them later on in order to tag
    this.setTree(dependenciesTree.tree);
    const devFiles = this.consumer.isLegacy ? testsFiles : await DependencyResolver.getDevFiles(this.component);
    await this.populateDependencies(allFiles, devFiles);
    return new DependenciesData(this.allDependencies, this.allPackagesDependencies, this.issues, this.coreAspects, {
      manuallyRemovedDependencies: this.overridesDependencies.manuallyRemovedDependencies,
      manuallyAddedDependencies: this.overridesDependencies.manuallyAddedDependencies,
      missingPackageDependencies: this.overridesDependencies.missingPackageDependencies,
    });
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
   * it found on a test file, it goes to `devDependencies`.
   * Similarly, when a package is found in a regular file, it goes to `packageDependencies`. When
   * if found in a test file, it goes to `devPackageDependencies`.
   * An exception for the above is when a package is required in a regular or test file but is also
   * mentioned in the `package.json` file as a peerDependency, in that case, the package is added
   * to `peerPackageDependencies` and removed from other places. Unless this package is overridden
   * and marked as ignored in the consumer or component config file.
   */
  async populateDependencies(files: string[], testsFiles: string[]) {
    files.forEach((file) => {
      const fileType: FileType = {
        isTestFile: testsFiles.includes(file),
      };
      this.throwForNonExistFile(file);
      if (this.overridesDependencies.shouldIgnoreFile(file, fileType)) {
        return;
      }
      this.processCoreAspects(file);
      this.processMissing(file, fileType);
      this.processErrors(file);
      this.processPackages(file, fileType);
      this.processComponents(file, fileType);
      this.processDepFiles(file, fileType);
      this.processUnidentifiedPackages(file, fileType);
    });

    this.removeIgnoredPackagesByOverrides();
    this.removeDevAndEnvDepsIfTheyAlsoRegulars();
    this.addCustomResolvedIssues();
    this.populatePeerPackageDependencies();
    if (!this.consumer.isLegacy) {
      this.applyWorkspacePolicy();
      await this.applyAutoDetectedPeersFromEnv();
    }
    this.manuallyAddDependencies();
    this.applyOverridesOnEnvPackages();
    this.coreAspects = R.uniq(this.coreAspects);
  }

  addCustomResolvedIssues() {
    if (this.consumer.isLegacy) return;
    const deps: Dependency[] = [...this.allDependencies.dependencies, ...this.allDependencies.devDependencies];
    const customModulesDeps = deps.filter((dep) => dep.relativePaths.some((r) => r.isCustomResolveUsed));
    if (customModulesDeps.length) {
      const importSources = customModulesDeps.reduce((acc, current) => {
        current.relativePaths.forEach((relativePath) => {
          if (relativePath.isCustomResolveUsed) {
            // @ts-ignore
            acc[relativePath.importSource] = current.id.toStringWithoutVersion();
          }
        });
        return acc;
      }, {});
      this.issues.getOrCreate(IssuesClasses.CustomModuleResolutionUsed).data = importSources;
    }
  }

  removeIgnoredPackagesByOverrides() {
    const shouldBeIncluded = (pkgVersion, pkgName) =>
      !this.overridesDependencies.shouldIgnorePackageByType(pkgName, 'dependencies');
    const shouldBeIncludedDev = (pkgVersion, pkgName) =>
      !this.overridesDependencies.shouldIgnorePackageByType(pkgName, 'devDependencies');

    this.allPackagesDependencies.packageDependencies = R.pickBy(
      shouldBeIncluded,
      this.allPackagesDependencies.packageDependencies
    );
    this.allPackagesDependencies.devPackageDependencies = R.pickBy(
      shouldBeIncludedDev,
      this.allPackagesDependencies.devPackageDependencies
    );
    this.allPackagesDependencies.compilerPackageDependencies = R.pickBy(
      shouldBeIncludedDev,
      this.allPackagesDependencies.compilerPackageDependencies
    );
    this.allPackagesDependencies.testerPackageDependencies = R.pickBy(
      shouldBeIncludedDev,
      this.allPackagesDependencies.testerPackageDependencies
    );
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
        components[depField].forEach((depData) =>
          this.allDependencies[depField].push({
            id: depData.componentId,
            relativePaths: [],
            packageName: depData.packageName,
          })
        );
      }
      if (packages[depField] && !R.isEmpty(packages[depField])) {
        Object.assign(this.allPackagesDependencies[this._pkgFieldMapping(depField)], packages[depField]);
      }
    });
    // The automatic dependency detector considers all found dependencies to be runtime dependencies.
    // But this breaks proper installation of injected subdependencies that are resolved from workspace components.
    if (this.allPackagesDependencies.packageDependencies && packages.peerDependencies) {
      for (const peerName of Object.keys(packages.peerDependencies)) {
        delete this.allPackagesDependencies.packageDependencies[peerName];
      }
    }
    if (this.allPackagesDependencies.packageDependencies && packages.peerPackageDependencies) {
      for (const peerName of Object.keys(packages.peerPackageDependencies)) {
        delete this.allPackagesDependencies.packageDependencies[peerName];
      }
    }
  }

  applyOverridesOnEnvPackages() {
    [this.component.compilerPackageDependencies, this.component.testerPackageDependencies].forEach((packages) => {
      DEPENDENCIES_FIELDS.forEach((fieldType) => {
        if (!packages[fieldType]) return;
        const shouldBeIncluded = (pkgVersion, pkgName) => {
          return !this.overridesDependencies.shouldIgnorePackageByType(pkgName, fieldType);
        };
        packages[fieldType] = R.pickBy(shouldBeIncluded, packages[fieldType]);
      });
    });
  }

  traverseTreeForComponentId(depFile: PathLinux): BitId | undefined {
    if (!this.tree[depFile] || (!this.tree[depFile].files && !this.tree[depFile].components)) return undefined;
    if (!this.componentMap.rootDir) {
      throw Error('traverseTreeForComponentId should get called only when rootDir is set');
    }
    const rootDirFullPath = path.join(this.consumerPath, this.componentMap.rootDir);
    const files = this.tree[depFile].files || [];

    if (files && !R.isEmpty(files)) {
      for (const file of files) {
        const fullDepFile = path.resolve(rootDirFullPath, file.file);
        const depRelativeToConsumer = pathNormalizeToLinux(path.relative(this.consumerPath, fullDepFile));
        const componentId = this.consumer.bitMap.getComponentIdByPath(depRelativeToConsumer);
        if (componentId) return componentId;
      }
    }
    if (this.tree[depFile].components && !R.isEmpty(this.tree[depFile].components)) {
      const components = this.tree[depFile].components || [];
      for (const comp of components) {
        return this.getComponentIdByResolvedPackageData(comp);
      }
    }

    if (files && !R.isEmpty(files)) {
      for (const file of files) {
        if (file.file !== depFile) {
          const componentId = this.traverseTreeForComponentId(file.file);
          if (componentId) return componentId;
        } else {
          logger.warn(`traverseTreeForComponentId found a cyclic dependency. ${file.file} depends on itself`);
        }
      }
    }
    return undefined;
  }

  getComponentIdByResolvedPackageData(bit: ResolvedPackageData): BitId {
    if (bit.componentId) {
      return bit.componentId;
    }
    if (!this.consumer.isLegacy) {
      throw new Error(`on Harmony resolved Bit component must have componentId prop in the package.json file`);
    }
    if (bit.fullPath) {
      return this.consumer.getComponentIdFromNodeModulesPath(bit.fullPath, this.component.bindingPrefix);
    }
    return packageNameToComponentId(this.consumer, bit.name, this.component.bindingPrefix);
  }

  /**
   * this happens when using relative paths between components, which is allowed on Legacy only.
   * on Harmony, during the execution of this function, it recognizes the use of relative-paths, enter
   * it to the "issues", then, later, it shows a warning on bit-status and block tagging.
   */
  getComponentIdByDepFile(depFile: PathLinux): {
    componentId: BitId | null | undefined;
    depFileRelative: PathLinux;
    destination: string | null | undefined;
  } {
    let depFileRelative: PathLinux = depFile; // dependency file path relative to consumer root
    let componentId: BitId | null | undefined;
    let destination: string | null | undefined;
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
    // We make sure also that it's not an AUTHORED component, which shouldn't have auto-generated files.
    if (!componentId && this.componentMap.origin !== COMPONENT_ORIGINS.AUTHORED) {
      componentId = this.traverseTreeForComponentId(depFile);
      if (!rootDir) throw new Error('rootDir must be set for non authored components');
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
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
   * allow "components" to have more data, such as importSource.
   * here, we go option #2, the alias is a relative path to the component. however, when there is
   * dist directory, the resolved path contains the "dist", which doesn't exist in the ComponentMap,
   * the solution we take is to identify such cases, strip the dist, then try to find them again.
   */
  _getComponentIdFromCustomResolveToPackageWithDist(depFile: string): BitId | null | undefined {
    if (!depFile.includes('dist')) return null;
    const resolveModules = this.consumer.config._resolveModules;
    if (!resolveModules || !resolveModules.aliases) return null;
    const aliases = resolveModules.aliases;
    const foundAlias = Object.keys(aliases).find((alias) => depFile.startsWith(aliases[alias]));
    if (!foundAlias) return null;
    const newDepFile = depFile.replace(
      `${resolveModules.aliases[foundAlias]}/dist`,
      resolveModules.aliases[foundAlias]
    );
    return this.consumer.bitMap.getComponentIdByPath(newDepFile);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getDependencyPathsFromModel(componentId: BitId, depFile: PathLinux, rootDir: PathLinux) {
    const dependency = this.componentFromModel
      .getAllDependencies()
      .find((dep) => dep.id.isEqualWithoutVersion(componentId));
    if (!dependency) {
      throw new ShowDoctorError( // $FlowFixMe
        `the auto-generated file ${depFile} should be connected to ${componentId}, however, it's not part of the model dependencies of ${this.componentFromModel.id}`
      );
    }

    const relativePath: RelativePath | undefined = dependency.relativePaths.find(
      (r) => r.sourceRelativePath === depFile
    );
    if (!relativePath) {
      throw new ShowDoctorError(
        `unable to find ${relativePath} path in the dependencies relativePaths of ${this.componentFromModel.id}`
      );
    }
    return {
      componentId: dependency.id,
      destination: relativePath.destinationRelativePath,
      depFileRelative: depFile,
    };
  }

  processDepFiles(originFile: PathLinuxRelative, fileType: FileType, nested = false) {
    // We don't just return because different files of the component might import different things from the depFile
    // See more info here: https://github.com/teambit/bit/issues/1796
    if (!this.processedFiles.includes(originFile)) {
      this.processedFiles.push(originFile);
      // We don't want to calculate nested files again after they calculated as direct files
    } else if (nested) {
      return;
    }
    const allDepsFiles = this.tree[originFile].files;
    if (!allDepsFiles || R.isEmpty(allDepsFiles)) return;
    allDepsFiles.forEach((depFile: FileObject) => {
      if (!nested && this.overridesDependencies.shouldIgnoreFile(depFile.file, fileType)) return;
      if (depFile.isLink) this.processLinkFile(originFile, depFile, fileType);
      else {
        const isDepFileUntracked = this.processOneDepFile(
          originFile,
          depFile.file,
          depFile.importSpecifiers,
          undefined,
          fileType,
          depFile,
          nested
        );
        // Only continue recursively if the dep file is untracked
        // for tracked deps if they have untracked deps they will be shown under their own components
        if (isDepFileUntracked) {
          // Recursively check for untracked files (to show them all in bit status)
          // for nested files we don't really care about the file types since we won't do all the checking
          const dummyFileType: FileType = {
            isTestFile: false,
          };
          this.processDepFiles(depFile.file, dummyFileType, true);
        }
      }
    });
  }

  // return true if the dep file is untracked
  // eslint-disable-next-line complexity
  processOneDepFile(
    originFile: PathLinuxRelative,
    depFile: string,
    importSpecifiers: ImportSpecifier[] | undefined,
    linkFile: string | undefined,
    fileType: FileType,
    depFileObject: FileObject,
    nested = false
  ): boolean {
    const { componentId, depFileRelative, destination } = this.getComponentIdByDepFile(depFile);
    const importSource: string = depFileObject.importSource as string;
    // the file dependency doesn't have any counterpart component. Add it to this.issues.untrackedDependencies
    if (!componentId) {
      const missingComponents = this.tree[depFile]?.missing?.components;
      if (missingComponents) {
        // this depFile is a dependency link and this dependency is missing.
        // it can't happen on Harmony, as Harmony doesn't have the generated dependencies files.
        this._addToMissingComponentsIfNeeded(missingComponents, originFile, fileType);
        return false;
      }
      this._pushToUntrackDependenciesIssues(originFile, depFileRelative, nested);
      return true;
    }
    if (this.overridesDependencies.shouldIgnoreComponent(componentId, fileType)) {
      // we can't support it because on the imported side, we don't know to convert the relative path
      // to the component name, as it won't have the component installed
      throw new GeneralError(`unable to ignore "${componentId.toString()}" dependency of "${this.componentId.toString()}" by using ignore components syntax because the component is required with relative path.
either, use the ignore file syntax or change the require statement to have a module path`);
    }
    // happens when in the same component one file requires another one. In this case, there is
    // noting to do regarding the dependencies
    if (componentId.isEqualWithoutVersion(this.componentId)) {
      if (depFileObject.isCustomResolveUsed) {
        this.component.customResolvedPaths.push({
          destinationPath: depFileObject.file,
          importSource,
        });
      }
      return false;
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
      destinationRelativePath,
    };
    if (importSpecifiers) {
      importSpecifiers.forEach((importSpecifier) => {
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        if (importSpecifier.linkFile) delete importSpecifier.linkFile.exported;
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        if (importSpecifier.mainFile) delete importSpecifier.mainFile.exported;
      });
      depsPaths.importSpecifiers = importSpecifiers;
    }
    if (depFileObject.isCustomResolveUsed) {
      depsPaths.isCustomResolveUsed = depFileObject.isCustomResolveUsed;
      depsPaths.importSource = importSource;
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
      return false;
    }
    this._pushToRelativeComponentsAuthoredIssues(originFile, componentId, importSource, depsPaths);

    const allDependencies: Dependency[] = [
      ...this.allDependencies.dependencies,
      ...this.allDependencies.devDependencies,
    ];
    const existingDependency = this.getExistingDependency(allDependencies, componentId);
    if (existingDependency) {
      const existingDepRelativePaths = this.getExistingDepRelativePaths(existingDependency, depsPaths);
      if (!existingDepRelativePaths) {
        // it is another file of an already existing component. Just add the new path
        existingDependency.relativePaths.push(depsPaths);
        return false;
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
      const depDebug: DebugComponentsDependency = {
        id: currentComponentsDeps.id,
        importSource,
      };
      this.pushToDependenciesArray(currentComponentsDeps, fileType, depDebug);
    }
    return false;
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
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        dependency.importSpecifiers.map((a) => delete a.linkFile);
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        nonLinkImportSpecifiers.push(dependency.importSpecifiers);
      } else {
        this.processOneDepFile(
          originFile,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          dependency.file,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
  processComponents(originFile: PathLinuxRelative, fileType: FileType) {
    const components = this.tree[originFile].components;
    if (!components || R.isEmpty(components)) return;
    components.forEach((compDep) => {
      let componentId = this.getComponentIdByResolvedPackageData(compDep);
      const depDebug: DebugComponentsDependency = {
        id: componentId,
        dependencyPackageJsonPath: compDep.packageJsonPath,
        dependentPackageJsonPath: compDep.dependentPackageJsonPath,
        componentIdResolvedFrom: this.consumer.isLegacy ? 'LegacyUnknown' : 'DependencyPkgJson',
        packageName: compDep.name,
      };
      const getVersionFromPkgJson = (): string | null => {
        const versionFromDependencyPkgJson = this.getValidVersion(compDep.concreteVersion);
        if (versionFromDependencyPkgJson) {
          depDebug.versionResolvedFrom = 'DependencyPkgJson';
          return versionFromDependencyPkgJson;
        }
        const versionFromDependentPkgJson = this.getValidVersion(compDep.versionUsedByDependent);
        if (versionFromDependentPkgJson) {
          depDebug.versionResolvedFrom = 'DependentPkgJson';
          return versionFromDependentPkgJson;
        }
        return null;
      };
      const version = getVersionFromPkgJson();
      if (version) {
        componentId = componentId.changeVersion(version);
      }
      if (this.overridesDependencies.shouldIgnoreComponent(componentId, fileType)) {
        return;
      }
      const getExistingId = (): BitId | undefined => {
        const existingIds = this.consumer.bitmapIdsFromCurrentLane.filterWithoutVersion(componentId);
        if (existingIds.length === 1) {
          depDebug.versionResolvedFrom = 'BitMap';
          return existingIds[0];
        }
        if (this.componentFromModel) {
          const modelDep = this.componentFromModel.getAllDependenciesIds().searchWithoutVersion(componentId);
          if (modelDep) {
            depDebug.versionResolvedFrom = 'Model';
            return modelDep;
          }
        }
        return undefined;
      };
      const existingId = version ? componentId : getExistingId();
      if (existingId) {
        if (existingId.isEqual(this.componentId)) {
          // happens when one of the component files requires another using module path
          // no need to enter anything to the dependencies
          return;
        }
        this.addImportNonMainIssueIfNeeded(originFile, compDep);
        const currentComponentsDeps: Dependency = { id: existingId, relativePaths: [], packageName: compDep.name };
        this._pushToDependenciesIfNotExist(currentComponentsDeps, fileType, depDebug);
      } else {
        this._pushToMissingComponentsIssues(originFile, componentId);
      }
    });
  }

  private addImportNonMainIssueIfNeeded(filePath: PathLinuxRelative, dependencyPkgData: ResolvedPackageData) {
    if (this.consumer.isLegacy) {
      return; // this is relevant for Harmony only
    }
    const depMain: PathLinuxRelative | undefined = dependencyPkgData.packageJsonContent?.main;
    if (!depMain) {
      return;
    }
    const depFullPath = pathNormalizeToLinux(dependencyPkgData.fullPath);

    if (depFullPath.endsWith(depMain)) {
      // it requires the main-file. all is good.
      return;
    }
    const extDisallowNonMain = ['.ts', '.tsx', '.js', '.jsx'];
    if (!extDisallowNonMain.includes(path.extname(depFullPath))) {
      // some files such as scss/json are needed to be imported as non-main
      return;
    }
    const pkgRootDir = dependencyPkgData.packageJsonContent?.componentRootFolder;
    if (pkgRootDir && !fs.existsSync(path.join(pkgRootDir, DEFAULT_DIST_DIRNAME))) {
      // the dependency wasn't compiled yet. the issue is probably because depMain points to the dist
      // and depFullPath is in the source.
      return;
    }
    const nonMainFileSplit = depFullPath.split(`node_modules/`);
    const nonMainFileShort = nonMainFileSplit[1] || nonMainFileSplit[0];
    (this.issues.getOrCreate(IssuesClasses.ImportNonMainFiles).data[filePath] ||= []).push(nonMainFileShort);
  }

  private getValidVersion(version: string | undefined) {
    if (!version) return null;
    if (!semver.valid(version) && !semver.validRange(version)) return null; // it's probably a relative path to the component
    return version.replace(/[^0-9.]/g, '');
  }

  processPackages(originFile: PathLinuxRelative, fileType: FileType) {
    const packages = this.tree[originFile].packages;
    if (!packages || R.isEmpty(packages)) return;
    if (fileType.isTestFile) {
      Object.assign(this.allPackagesDependencies.devPackageDependencies, packages);
    } else {
      Object.assign(this.allPackagesDependencies.packageDependencies, packages);
    }
    this._addTypesPackagesForTypeScript(packages, originFile);
  }

  processMissing(originFile: PathLinuxRelative, fileType: FileType) {
    const missing = this.tree[originFile].missing;
    if (!missing) return;
    const processMissingFiles = () => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (isNilOrEmpty(missing.files)) return;
      const absOriginFile = this.consumer.toAbsolutePath(originFile);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
      if (isNilOrEmpty(missing.packages)) return;
      const missingPackages = missing.packages.filter(
        (pkg) => !this.overridesDependencies.shouldIgnorePackage(pkg, fileType)
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
      if (isNilOrEmpty(missing.components)) return;
      this._addToMissingComponentsIfNeeded(missing.components, originFile, fileType);
    };
    processMissingFiles();
    processMissingPackages();
    processMissingComponents();
  }

  _addToMissingComponentsIfNeeded(missingComponents: string[], originFile: string, fileType: FileType) {
    if (!this.consumer.isLegacy) {
      // on Harmony we don't guess whether a path is a component or a package based on the path only,
      // see missing-handler.groupMissingByType() for more info.
      throw new Error(
        `Harmony should not have "missing.components" (only "missing.packages"). got ${missingComponents.join(',')}`
      );
    }
    missingComponents.forEach((missingBit) => {
      const componentId: BitId = this.consumer.getComponentIdFromNodeModulesPath(
        missingBit,
        this.component.bindingPrefix
      );
      if (this.overridesDependencies.shouldIgnoreComponent(componentId, fileType)) return;
      // In case the component it missing, it might consider as a package sometime, check if we should ignore it by the package name
      if (this.overridesDependencies.shouldIgnorePackage(missingBit, fileType)) return;
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
    logger.error('dependency-resolver.processErrors', error);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (error.code === 'PARSING_ERROR')
      this.issues.getOrCreate(IssuesClasses.ParseErrors).data[originFile] = error.message;
    else this.issues.getOrCreate(IssuesClasses.ResolveErrors).data[originFile] = error.message;
  }

  /**
   * when a user uses core-extensions these core-extensions should not be dependencies.
   * here, we filter them out from all places they could entered as dependencies.
   * an exception is when running this method on bit-core-extensions themselves (dogfooding), in
   * which case we recognizes that the current originFile is a core-extension and avoid filtering.
   */
  processCoreAspects(originFile: PathLinuxRelative) {
    const coreAspects = DependencyResolver.getCoreAspectsPackagesAndIds?.();
    if (!coreAspects) {
      return;
    }

    // const scopes = coreAspects.map((id) => {
    //   const id = id.split()
    // });

    const coreAspectIds = Object.values(coreAspects);
    const defaultScope = this.component.defaultScope;

    let id: undefined | BitId;

    if (this.component.id.scope) {
      id = this.component.id;
    } else {
      id = this.component.id.changeScope(defaultScope);
    }

    if (coreAspectIds.includes(id.toStringWithoutVersion())) {
      return;
    }

    const coreAspectsPackages = Object.keys(coreAspects);

    const components = this.tree[originFile].components;
    const unidentifiedPackages = this.tree[originFile].unidentifiedPackages;
    const missingComponents = this.tree[originFile]?.missing?.components;
    const usedCoreAspects: string[] = [];

    const findMatchingCoreAspect = (packageName: string) => {
      return coreAspectsPackages.find((coreAspectName) => packageName === coreAspectName);
    };
    const unidentifiedPackagesFiltered = unidentifiedPackages?.filter((packageName) => {
      const matchingCoreAspectPackageName = findMatchingCoreAspect(packageName);
      if (matchingCoreAspectPackageName) {
        usedCoreAspects.push(coreAspects[matchingCoreAspectPackageName]);
      }
      return !matchingCoreAspectPackageName;
    });
    const bitsFiltered = components?.filter((packageInfo) => {
      const matchingCoreAspectPackageName = findMatchingCoreAspect(packageInfo.name);
      if (matchingCoreAspectPackageName) {
        usedCoreAspects.push(coreAspects[matchingCoreAspectPackageName]);
      }
      return !matchingCoreAspectPackageName;
    });
    const missingBitsFiltered = missingComponents?.filter((packageName) => {
      const matchingCoreAspectPackageName = findMatchingCoreAspect(packageName);
      if (matchingCoreAspectPackageName) {
        usedCoreAspects.push(coreAspects[matchingCoreAspectPackageName]);
      }
      return !matchingCoreAspectPackageName;
    });

    if (missingComponents) {
      // @ts-ignore not clear why this error happens, it is verified that missing.components exist
      this.tree[originFile].missing.components = missingBitsFiltered;
    }

    this.tree[originFile].unidentifiedPackages = unidentifiedPackagesFiltered;
    this.tree[originFile].components = bitsFiltered;
    this.coreAspects.push(...R.uniq(usedCoreAspects));
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
   *
   * keep in mind that this custom-modules-resolution supported on legacy components only.
   * as such, no need to find the packageName to pass to _pushToDependenciesIfNotExist method.
   */
  processUnidentifiedPackages(originFile: PathLinuxRelative, fileType: FileType) {
    const unidentifiedPackages = this.tree[originFile].unidentifiedPackages;
    if (!unidentifiedPackages || !unidentifiedPackages.length) return;
    this.debugDependenciesData.unidentifiedPackages = unidentifiedPackages;
    if (!this.componentFromModel) return; // not relevant, the component is not imported
    const getDependencies = (): Dependencies => {
      if (fileType.isTestFile) return this.componentFromModel.devDependencies;
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
      const foundImportSource = Object.keys(importSourceMap).find((importSource) =>
        packageWithNoNodeModules.startsWith(importSource)
      );
      if (foundImportSource) {
        const dependencyId: BitId = importSourceMap[foundImportSource];
        const currentComponentDeps = {
          id: dependencyId,
          // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
          relativePaths: clonedDependencies.getById(dependencyId).relativePaths,
        };
        const depData: DebugComponentsDependency = { id: dependencyId, importSource: foundImportSource };
        this._pushToDependenciesIfNotExist(currentComponentDeps, fileType, depData);
      }
    });
  }

  private _pushToDependenciesIfNotExist(
    dependency: Dependency,
    fileType: FileType,
    depDebug: DebugComponentsDependency
  ) {
    const existingDependency = this.getExistingDependency(this.allDependencies.dependencies, dependency.id);
    const existingDevDependency = this.getExistingDependency(this.allDependencies.devDependencies, dependency.id);
    // no need to enter dev dependency to devDependencies if it exists already in dependencies
    if (existingDependency || (existingDevDependency && fileType.isTestFile)) {
      return;
    }
    // at this point, either, it doesn't exist at all and should be entered.
    // or it exists in devDependencies but now it comes from non-dev file, which should be entered
    // as non-dev.
    this.pushToDependenciesArray(dependency, fileType, depDebug);
  }

  pushToDependenciesArray(currentComponentsDeps: Dependency, fileType: FileType, depDebug: DebugComponentsDependency) {
    if (fileType.isTestFile) {
      this.allDependencies.devDependencies.push(currentComponentsDeps);
    } else {
      this.allDependencies.dependencies.push(currentComponentsDeps);
    }
    this.debugDependenciesData.components.push(depDebug);
  }

  /**
   * Remove the dependencies which appear both in dev and regular deps from the dev
   * Because if a dependency is both dev dependency and regular dependency it should be treated as regular one
   * Apply for both packages and components dependencies
   */
  removeDevAndEnvDepsIfTheyAlsoRegulars() {
    // remove dev and env packages that are also regular packages
    const getNotRegularPackages = (packages) =>
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

    // remove dev dependencies that are also regular dependencies
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentDepsIds = new BitIds(...this.allDependencies.dependencies.map((c) => c.id));
    this.allDependencies.devDependencies = this.allDependencies.devDependencies.filter(
      (d) => !componentDepsIds.has(d.id)
    );
  }

  /**
   * given missing packages name, find whether they were dependencies with custom-resolve before.
   */
  findOriginallyCustomModuleResolvedDependencies(packages: string[]): Record<string, any> | null | undefined {
    if (!packages) return undefined;
    if (!this.componentFromModel) return undefined; // not relevant, the component is not imported
    const dependencies: Dependencies = new Dependencies(this.componentFromModel.getAllDependencies());
    if (dependencies.isEmpty()) return undefined;
    const importSourceMap = dependencies.getCustomResolvedData();
    if (R.isEmpty(importSourceMap)) return undefined;
    const foundPackages = packages.reduce((acc, value) => {
      const packageLinuxFormat = pathNormalizeToLinux(value);
      const foundImportSource = Object.keys(importSourceMap).find((importSource) =>
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

  getExistingDependency(dependencies: Dependency[], id: BitId): Dependency | null | undefined {
    return dependencies.find((d) => d.id.isEqualWithoutVersion(id));
  }

  getExistingDepRelativePaths(dependency: Dependency, relativePath: RelativePath) {
    if (!dependency.relativePaths || R.isEmpty(dependency.relativePaths)) return null;
    return dependency.relativePaths.find(
      (paths) =>
        paths.sourceRelativePath === relativePath.sourceRelativePath &&
        paths.destinationRelativePath === relativePath.destinationRelativePath
    );
  }

  getDiffSpecifiers(originSpecifiers: ImportSpecifier[], targetSpecifiers: ImportSpecifier[]) {
    const cmp = (specifier1, specifier2) => specifier1.mainFile.name === specifier2.mainFile.name;
    return R.differenceWith(cmp, targetSpecifiers, originSpecifiers);
  }

  /**
   * For author, the peer-dependencies are set in the root package.json
   * For imported components, we don't want to change the peerDependencies of the author, unless
   * we're certain the user intent to do so. Therefore, we ignore the root package.json and look for
   * the package.json in the component's directory.
   */
  populatePeerPackageDependencies(): void {
    const getPeerDependencies = (): Record<string, any> => {
      const packageJson = this._getPackageJson();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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

  applyWorkspacePolicy(): void {
    const wsPolicy = DependencyResolver.getWorkspacePolicy();
    if (!wsPolicy) return;
    const wsPeer = wsPolicy.peerDependencies || {};
    const wsRegular = wsPolicy.dependencies || {};
    const peerDeps = this.allPackagesDependencies.peerPackageDependencies || {};
    // we are not iterate component deps since they are resolved from what actually installed
    // the policy used for installation only in that case
    ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].forEach((field) => {
      R.forEachObjIndexed((_pkgVal, pkgName) => {
        const peerVersionFromWsPolicy = wsPeer[pkgName];
        const regularVersionFromWsPolicy = wsRegular[pkgName];
        if (peerVersionFromWsPolicy) {
          delete this.allPackagesDependencies[field][pkgName];
          peerDeps[pkgName] = peerVersionFromWsPolicy;
        } else if (regularVersionFromWsPolicy) {
          this.allPackagesDependencies[field][pkgName] = regularVersionFromWsPolicy;
        }
      }, this.allPackagesDependencies[field]);
    });
    this.allPackagesDependencies.peerPackageDependencies = peerDeps;
  }

  async applyAutoDetectedPeersFromEnv(): Promise<void> {
    const envPolicy = await DependencyResolver.getHarmonyEnvPeersPolicy(this.component.extensions);
    if (!envPolicy || !Object.keys(envPolicy).length) {
      return;
    }
    const peerDeps = this.allPackagesDependencies.peerPackageDependencies || {};
    // we are not iterate component deps since they are resolved from what actually installed
    // the policy used for installation only in that case
    ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].forEach((field) => {
      R.forEachObjIndexed((_pkgVal, pkgName) => {
        const peerVersionFromEnvPolicy = envPolicy[pkgName];
        if (this.overridesDependencies.shouldIgnorePeerPackage(pkgName)) return;
        if (peerVersionFromEnvPolicy) {
          delete this.allPackagesDependencies[field][pkgName];
          peerDeps[pkgName] = peerVersionFromEnvPolicy;
        }
      }, this.allPackagesDependencies[field]);
    });
    // TODO: handle component deps once we support peers between components
    this.allPackagesDependencies.peerPackageDependencies = peerDeps;
  }

  /**
   * returns `package.json` of the component when it's imported, or `package.json` of the workspace
   * when it's authored.
   */
  _getPackageJson(): Record<string, any> | undefined {
    const componentMap = this.component.componentMap;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const isAuthor = componentMap.origin === COMPONENT_ORIGINS.AUTHORED;
    if (isAuthor) {
      return this.consumer.packageJson.packageJsonObject;
    }
    if (this.component.packageJsonFile && this.component.packageJsonFile.fileExist) {
      return this.component.packageJsonFile.packageJsonObject;
    }
    if (this.componentFromModel) {
      // a component is imported but the package.json file is missing or never written
      // read the values from the model
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const packageJson = PackageJsonFile.createFromComponent(componentMap.rootDir, this.componentFromModel);
      return packageJson.packageJsonObject;
    }
    return undefined;
  }

  private setLegacyInsideHarmonyIssue() {
    if (this.consumer.isLegacy) return;
    if (this.componentFromModel && this.componentFromModel.isLegacy) {
      this.issues.getOrCreate(IssuesClasses.LegacyInsideHarmony).data = true;
    }
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
  _addTypesPackagesForTypeScript(packages: Record<string, any>, originFile: PathLinuxRelative): void {
    const isTypeScript = getExt(originFile) === 'ts' || getExt(originFile) === 'tsx';
    if (!isTypeScript) return;
    let depsHost = this._getPackageJson();
    if (!this.consumer.isLegacy) {
      depsHost = DependencyResolver.getWorkspacePolicy();
    }
    if (!depsHost) return;
    const addIfNeeded = (depField: string, packageName: string) => {
      if (!depsHost || !depsHost[depField]) return;
      const typesPackage = packageToDefinetlyTyped(packageName);
      if (!depsHost[depField][typesPackage]) return;
      Object.assign(this.allPackagesDependencies[this._pkgFieldMapping('devDependencies')], {
        [typesPackage]: depsHost[depField][typesPackage],
      });
    };
    Object.keys(packages).forEach((packageName) => {
      DEPENDENCIES_FIELDS.forEach((depField) => addIfNeeded(depField, packageName));
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

  _pushToUntrackDependenciesIssues(originFile: PathLinuxRelative, depFileRelative, nested = false) {
    const findExisting = () => {
      let result;
      R.forEachObjIndexed((currentUntracked) => {
        const found = currentUntracked.untrackedFiles.find((file) => {
          return file.relativePath === depFileRelative;
        });
        if (found) {
          result = found;
        }
      }, this.issues.getIssue(IssuesClasses.UntrackedDependencies)?.data || {});
      return result;
    };
    const existing = findExisting();
    const newUntrackedFile = { relativePath: depFileRelative, existing: false };
    // If it's already found mark them both as existing
    if (existing) {
      newUntrackedFile.existing = true;
      existing.existing = true;
    }
    const untrackIssue = this.issues.getOrCreate(IssuesClasses.UntrackedDependencies);
    const untrackedCurrentFile = untrackIssue?.data[originFile];
    if (untrackedCurrentFile) {
      untrackedCurrentFile.untrackedFiles.push(newUntrackedFile);
    } else {
      untrackIssue.data[originFile] = { nested, untrackedFiles: [newUntrackedFile] };
    }
  }
  _pushToRelativeComponentsIssues(originFile, componentId: BitId) {
    (this.issues.getOrCreate(IssuesClasses.relativeComponents).data[originFile] ||= []).push(componentId);
  }
  _pushToRelativeComponentsAuthoredIssues(originFile, componentId, importSource: string, relativePath: RelativePath) {
    (this.issues.getOrCreate(IssuesClasses.relativeComponentsAuthored).data[originFile] ||= []).push({
      importSource,
      componentId,
      relativePath,
    });
  }
  _pushToMissingDependenciesOnFs(originFile: PathLinuxRelative, missingFiles: string[]) {
    (this.issues.getOrCreate(IssuesClasses.MissingDependenciesOnFs).data[originFile] ||= []).push(...missingFiles);
  }
  _pushToMissingPackagesDependenciesIssues(originFile: PathLinuxRelative, missingPackages: string[]) {
    (this.issues.getOrCreate(IssuesClasses.MissingPackagesDependenciesOnFs).data[originFile] ||= []).push(
      ...missingPackages
    );
  }
  _pushToMissingCustomModuleIssues(originFile: PathLinuxRelative, componentId: string) {
    (this.issues.getOrCreate(IssuesClasses.MissingCustomModuleResolutionLinks).data[originFile] ||= []).push(
      componentId
    );
  }
  _pushToMissingLinksIssues(originFile: PathLinuxRelative, componentId: BitId) {
    (this.issues.getOrCreate(IssuesClasses.MissingLinks).data[originFile] ||= []).push(componentId);
  }
  _pushToMissingComponentsIssues(originFile: PathLinuxRelative, componentId: BitId) {
    (this.issues.getOrCreate(IssuesClasses.MissingComponents).data[originFile] ||= []).push(componentId);
  }
}
