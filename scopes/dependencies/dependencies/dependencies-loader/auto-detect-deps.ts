import * as path from 'path';
import fs from 'fs-extra';
import semver from 'semver';
import { isSnap } from '@teambit/component-version';
import type { ComponentID } from '@teambit/component-id';
import { uniq, isEmpty, forEach, differenceWith } from 'lodash';
import type { IssuesList } from '@teambit/component-issues';
import { IssuesClasses } from '@teambit/component-issues';
import type { RelativePath, ImportSpecifier, ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { Dependency } from '@teambit/legacy.consumer-component';
import { DEFAULT_DIST_DIRNAME, DEPENDENCIES_FIELDS } from '@teambit/legacy.constants';
import type { Consumer } from '@teambit/legacy.consumer';
import { logger } from '@teambit/legacy.logger';
import { getExt } from '@teambit/toolbox.fs.extension-getter';
import type { PathLinux, PathLinuxRelative, PathOsBased } from '@teambit/legacy.utils';
import { pathNormalizeToLinux, pathRelativeLinux, removeFileExtension } from '@teambit/legacy.utils';
import type { ResolvedPackageData } from '../resolve-pkg-data';
import type { ComponentMap } from '@teambit/legacy.bit-map';
import { SNAP_VERSION_PREFIX } from '@teambit/component-package-version';
import type { DependencyResolverMain, DependencyDetector } from '@teambit/dependency-resolver';
import { getDependencyTree } from '../files-dependency-builder';
import type { FileObject, DependenciesTree } from '../files-dependency-builder/types/dependency-tree-type';
import type { DevFilesMain } from '@teambit/dev-files';
import type { Workspace } from '@teambit/workspace';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { packageToDefinetlyTyped } from './package-to-definetly-typed';
import { DependenciesData } from './dependencies-data';
import type { AllDependencies, AllPackagesDependencies } from './apply-overrides';

export type FileType = {
  isTestFile: boolean;
};

export type DebugDependencies = {
  components: DebugComponentsDependency[];
  unidentifiedPackages?: string[];
};

export type DebugComponentsDependency = {
  id: ComponentID;
  importSource?: string;
  dependencyPackageJsonPath?: string;
  dependentPackageJsonPath?: string;
  // can be resolved here or can be any one of the strategies in dependencies-version-resolver
  versionResolvedFrom?: 'DependencyPkgJson' | 'DependentPkgJson' | 'BitMap' | 'Model' | 'MergeConfig' | string;
  version?: string;
  componentIdResolvedFrom?: 'DependencyPkgJson' | 'DependencyPath';
  packageName?: string;
};

type PushToDepsArrayOpts = {
  fileType: FileType;
  depDebug: DebugComponentsDependency;
  isPeer?: boolean;
};

export class AutoDetectDeps {
  componentId: ComponentID;
  componentMap: ComponentMap;
  componentFromModel: Component;
  consumerPath: PathOsBased;
  tree: DependenciesTree;
  allDependencies: AllDependencies;
  allPackagesDependencies: AllPackagesDependencies;
  issues: IssuesList;
  coreAspects: string[] = [];
  processedFiles: string[];
  debugDependenciesData: DebugDependencies;
  autoDetectConfigMerge: Record<string, any>;
  constructor(
    private component: Component,
    private workspace: Workspace,
    private devFiles: DevFilesMain,
    private depsResolver: DependencyResolverMain,
    private aspectLoader: AspectLoaderMain
  ) {
    this.componentId = component.componentId;
    // the consumerComponent is coming from the workspace, so it must have the componentMap prop
    this.componentMap = this.component.componentMap as ComponentMap;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentFromModel = this.component.componentFromModel;
    this.consumerPath = this.consumer.getPath();
    this.allDependencies = {
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
    };
    this.allPackagesDependencies = {
      packageDependencies: {},
      devPackageDependencies: {},
      peerPackageDependencies: {},
    };
    this.processedFiles = [];
    this.issues = component.issues;
    this.debugDependenciesData = { components: [] };
  }

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  private setTree(tree: DependenciesTree) {
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
  ): Promise<{ dependenciesData: DependenciesData; debugDependenciesData: DebugDependencies }> {
    const componentDir = path.join(this.consumerPath, this.componentMap.rootDir);
    const allFiles = this.componentMap.getAllFilesPaths();
    const envDetectors = await this.getEnvDetectors();
    // find the dependencies (internal files and packages) through automatic dependency resolution
    const dependenciesTree = await getDependencyTree({
      componentDir,
      workspacePath: this.consumerPath,
      filePaths: allFiles,
      visited: cacheResolvedDependencies,
      cacheProjectAst,
      envDetectors,
    });
    // we have the files dependencies, these files should be components that are registered in bit.map. Otherwise,
    // they are referred as "untracked components" and the user should add them later on in order to tag
    this.setTree(dependenciesTree.tree);
    if (dependenciesTree.tree['env.jsonc']?.components.length > 0) {
      await this.populateDependencies(['env.jsonc'], []);
    }
    const envExtendsDeps = this.allDependencies.dependencies.length
      ? this.allDependencies.dependencies
      : this.component.componentFromModel?.dependencies.dependencies;
    const devFiles = await this.devFiles.getDevFilesForConsumerComp(this.component, envExtendsDeps);
    await this.populateDependencies(allFiles, devFiles);
    return {
      dependenciesData: new DependenciesData(
        this.allDependencies,
        this.allPackagesDependencies,
        this.issues,
        this.coreAspects
      ),
      debugDependenciesData: this.debugDependenciesData,
    };
  }

  async getEnvDetectors(): Promise<DependencyDetector[] | null> {
    return this.depsResolver.calcComponentEnvDepDetectors(this.component.extensions);
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
  private async populateDependencies(files: string[], testsFiles: string[]) {
    files.forEach((file) => {
      const fileType: FileType = {
        isTestFile: testsFiles.includes(file),
      };
      this.throwForNonExistFile(file);
      this.processCoreAspects(file);
      this.processMissing(file, fileType);
      this.processErrors(file);
      this.processPackages(file, fileType);
      this.processComponents(file, fileType);
      this.processDepFiles(file, fileType);
      this.processUnidentifiedPackages(file);
    });
  }

  private throwForNonExistFile(file: string) {
    if (!this.tree[file]) {
      throw new Error(
        `DependencyResolver: a file "${file}" was not returned from the driver, its dependencies are unknown`
      );
    }
  }

  private getComponentIdByResolvedPackageData(bit: ResolvedPackageData): ComponentID {
    if (!bit.componentId) {
      throw new Error(`resolved Bit component must have componentId prop in the package.json file`);
    }
    return bit.componentId;
  }

  /**
   * this happens when using relative paths between components, which is allowed on Legacy only.
   * on Harmony, during the execution of this function, it recognizes the use of relative-paths, enter
   * it to the "issues", then, later, it shows a warning on bit-status and block tagging.
   */
  private getComponentIdByDepFile(depFile: PathLinux): {
    componentId: ComponentID | undefined;
    depFileRelative: PathLinux;
    destination: string | null | undefined;
  } {
    let depFileRelative: PathLinux = depFile; // dependency file path relative to consumer root
    const rootDir = this.componentMap.rootDir;
    // The depFileRelative is relative to rootDir, change it to be relative to current consumer.
    // We can't use path.resolve(rootDir, fileDep) because this might not work when running
    // bit commands not from root, because resolve take by default the process.cwd
    const rootDirFullPath = path.join(this.consumerPath, rootDir);
    const fullDepFile = path.resolve(rootDirFullPath, depFile);
    depFileRelative = pathNormalizeToLinux(path.relative(this.consumerPath, fullDepFile));

    const componentId = this.consumer.bitMap.getComponentIdByPath(depFileRelative);

    return { componentId, depFileRelative, destination: undefined };
  }

  private processDepFiles(originFile: PathLinuxRelative, fileType: FileType, nested = false) {
    // We don't just return because different files of the component might import different things from the depFile
    // See more info here: https://github.com/teambit/bit/issues/1796
    if (!this.processedFiles.includes(originFile)) {
      this.processedFiles.push(originFile);
      // We don't want to calculate nested files again after they calculated as direct files
    } else if (nested) {
      return;
    }
    const allDepsFiles = this.tree[originFile].files;
    if (!allDepsFiles || isEmpty(allDepsFiles)) return;
    allDepsFiles.forEach((depFile: FileObject) => {
      const isDepFileUntracked = this.processOneDepFile(
        originFile,
        depFile.file,
        depFile.importSpecifiers,
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
    });
  }

  // return true if the dep file is untracked
  private processOneDepFile(
    originFile: PathLinuxRelative,
    depFile: string,
    importSpecifiers: ImportSpecifier[] | undefined,
    fileType: FileType,
    depFileObject: FileObject,
    nested = false
  ): boolean {
    const { componentId, depFileRelative, destination } = this.getComponentIdByDepFile(depFile);
    const importSource: string = depFileObject.importSource as string;
    // the file dependency doesn't have any counterpart component. Add it to this.issues.untrackedDependencies
    if (!componentId) {
      this._pushToUntrackDependenciesIssues(originFile, depFileRelative, nested);
      return true;
    }
    // happens when in the same component one file requires another one. In this case, there is
    // noting to do regarding the dependencies
    if (componentId.isEqual(this.componentId, { ignoreVersion: true })) {
      if (importSource === '.' || importSource.endsWith('/..')) {
        (this.issues.getOrCreate(IssuesClasses.ImportFromDirectory).data[originFile] ||= []).push(importSource);
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

    // when there is no rootDir for the current dependency (it happens when it's AUTHORED), keep the original path
    const sourceRelativePath = depRootDir ? depFileRelative : depFile;

    const depsPaths: RelativePath = {
      sourceRelativePath,
      destinationRelativePath,
    };
    if (importSpecifiers) {
      importSpecifiers.forEach((importSpecifier) => {
        if (importSpecifier.mainFile) delete importSpecifier.mainFile.exported;
      });
      depsPaths.importSpecifiers = importSpecifiers;
    }
    const currentComponentsDeps = new Dependency(componentId, [depsPaths]);
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

      if (depsPaths.importSource && !existingDepRelativePaths.importSource) {
        existingDepRelativePaths.importSource = depsPaths.importSource;
      }
    } else {
      const depDebug: DebugComponentsDependency = {
        id: currentComponentsDeps.id,
        importSource,
      };
      this.pushToDependenciesArray(currentComponentsDeps, { fileType, depDebug });
    }
    return false;
  }

  /**
   * process require/import of Bit components where the require statement is not a relative path
   * but a module path, such as `require('@bit/bit.envs/compiler/babel');`
   */
  private processComponents(originFile: PathLinuxRelative, fileType: FileType) {
    const components = this.tree[originFile].components;
    if (!components || isEmpty(components)) return;
    components.forEach((compDep) => {
      let componentId = this.getComponentIdByResolvedPackageData(compDep);
      if (componentId.isEqual(this.componentId)) {
        this.issues.getOrCreate(IssuesClasses.SelfReference).data[originFile] = compDep.name;
        // the component is importing itself, so ignore it. although currently it doesn't cause any issues, (probably
        // because it filtered out later), it's better to remove it as soon as possible, for less-confusing debugging.
        return;
      }
      const depDebug: DebugComponentsDependency = {
        id: componentId,
        dependencyPackageJsonPath: compDep.packageJsonPath,
        dependentPackageJsonPath: compDep.dependentPackageJsonPath,
        componentIdResolvedFrom: 'DependencyPkgJson',
        packageName: compDep.name,
      };
      if (originFile === 'env.jsonc') {
        depDebug.importSource = 'env.jsonc';
      }
      const getVersionFromPkgJson = (): string | null => {
        const { version: versionFromDependencyPkgJson } = getValidComponentVersion(compDep.concreteVersion);
        if (versionFromDependencyPkgJson) {
          depDebug.versionResolvedFrom = 'DependencyPkgJson';
          return versionFromDependencyPkgJson;
        }
        const { version: versionFromDependentPkgJson } = getValidComponentVersion(compDep.versionUsedByDependent);
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
      const existingId = componentId;
      if (existingId.isEqual(this.componentId)) {
        // happens when one of the component files requires another using module path
        // no need to enter anything to the dependencies
        return;
      }
      this.addImportNonMainIssueIfNeeded(originFile, compDep);
      const isPeer = compDep.packageJsonContent?.bit?.peer;
      let peerVersionRange: string | undefined;
      if (isPeer) {
        const defaultPeerRange = compDep.packageJsonContent?.bit?.defaultPeerRange;
        if (!defaultPeerRange) {
          peerVersionRange = '*';
        } else if (['~', '^', '>='].includes(defaultPeerRange)) {
          if (semver.valid(compDep.concreteVersion)) {
            peerVersionRange = `${defaultPeerRange}${compDep.concreteVersion}`;
          } else {
            peerVersionRange = `${defaultPeerRange}0.0.0-${compDep.concreteVersion}`;
          }
        } else {
          peerVersionRange = defaultPeerRange;
        }
      }
      const currentComponentsDeps = new Dependency(existingId, [], compDep.name, peerVersionRange);
      this._pushToDependenciesIfNotExist(currentComponentsDeps, {
        fileType,
        depDebug,
        isPeer,
      });
    });
  }

  private isPkgInWorkspacePolicies(pkgName: string) {
    return this.depsResolver.getWorkspacePolicyManifest().dependencies?.[pkgName];
  }

  private addImportNonMainIssueIfNeeded(filePath: PathLinuxRelative, dependencyPkgData: ResolvedPackageData) {
    const depMain: PathLinuxRelative | undefined = dependencyPkgData.packageJsonContent?.main;
    if (!depMain) {
      return;
    }
    const normalizedDepMain = depMain.replace('./', '');
    const depFullPath = pathNormalizeToLinux(dependencyPkgData.fullPath);
    if (depFullPath.endsWith(normalizedDepMain)) {
      // it requires the main-file. all is good.
      return;
    }
    const extDisallowNonMain = ['.ts', '.tsx', '.js', '.jsx'];
    if (!extDisallowNonMain.includes(path.extname(depFullPath))) {
      // some files such as scss/json are needed to be imported as non-main
      return;
    }
    const pkgRootDir = dependencyPkgData.packageJsonPath && path.dirname(dependencyPkgData.packageJsonPath);
    if (pkgRootDir && !fs.existsSync(path.join(pkgRootDir, DEFAULT_DIST_DIRNAME))) {
      // the dependency wasn't compiled yet. the issue is probably because depMain points to the dist
      // and depFullPath is in the source.
      return;
    }
    const nonMainFileSplit = depFullPath.split(`node_modules/`);
    const nonMainFileShort = nonMainFileSplit[1] || nonMainFileSplit[0];
    if (nonMainFileShort.includes('eslintrc')) {
      // a temporary workaround for envs that don't expose eslintrc config in their index file.
      // this is needed for a future change of detecting require.resolve syntax
      return;
    }
    (this.issues.getOrCreate(IssuesClasses.ImportNonMainFiles).data[filePath] ||= []).push(nonMainFileShort);
  }

  private processPackages(originFile: PathLinuxRelative, fileType: FileType) {
    const packages = this.tree[originFile].packages;
    if (this.componentFromModel) {
      const modelDeps = this.componentFromModel.getAllPackageDependencies();
      // If a package is not in the policies, then we resolve the package from the model.
      for (const pkgName of Object.keys(packages)) {
        if (!this.isPkgInWorkspacePolicies(pkgName) && modelDeps[pkgName]) {
          packages[pkgName] = modelDeps[pkgName];
        }
      }
    }
    const packageNames = Object.keys(packages).concat(this.tree[originFile].missing?.packages ?? []);
    this._addTypesPackagesForTypeScript(packageNames, originFile);
    if (!packages || isEmpty(packages)) return;
    if (fileType.isTestFile) {
      Object.assign(this.allPackagesDependencies.devPackageDependencies, packages);
    } else {
      Object.assign(this.allPackagesDependencies.packageDependencies, packages);
    }
  }

  private processMissing(originFile: PathLinuxRelative, fileType: FileType) {
    const missing = this.tree[originFile].missing;
    if (!missing) return;
    const processMissingFiles = () => {
      if (isEmpty(missing.files)) return;
      const missingFiles = missing.files.filter((file) => {
        const hasExtension = Boolean(path.extname(file));
        if (!hasExtension) return true;
        // the missing file has extension, e.g. "index.js". It's possible that this file doesn't exist in the source
        // but will be available in the dists. so if found same filename without the extension, we assume it's fine.
        const rootDirAbs = this.consumer.toAbsolutePath(this.componentMap.rootDir);
        const filePathAbs = path.resolve(rootDirAbs, file);
        const relativeToCompDir = path.relative(rootDirAbs, filePathAbs);
        const relativeToCompDirWithoutExt = removeFileExtension(relativeToCompDir);
        const compFilesWithoutExt = this.componentMap.getAllFilesPaths().map((f) => removeFileExtension(f));
        const existWithDifferentExt = compFilesWithoutExt.some((f) => f === relativeToCompDirWithoutExt);
        return !existWithDifferentExt;
      });
      if (isEmpty(missingFiles)) return;
      this._pushToMissingDependenciesOnFs(originFile, missingFiles);
    };
    const processMissingPackages = () => {
      if (isEmpty(missing.packages)) return;
      const missingPackages = missing.packages;
      if (!isEmpty(missingPackages)) {
        this._pushToMissingPackagesDependenciesIssues(originFile, missingPackages, fileType);
      }
    };
    processMissingFiles();
    processMissingPackages();
  }

  private processErrors(originFile: PathLinuxRelative) {
    const error: any = this.tree[originFile].error;
    if (!error) return;
    logger.errorAndAddBreadCrumb(
      'dependency-resolver.processErrors',
      `got an error from the driver while resolving dependencies from "${originFile}"`
    );
    logger.error('dependency-resolver.processErrors', error);
    if (error.code === 'PARSING_ERROR') {
      const location = error.lineNumber && error.column ? ` (line: ${error.lineNumber}, column: ${error.column})` : '';
      this.issues.getOrCreate(IssuesClasses.ParseErrors).data[originFile] = error.message + location;
    } else this.issues.getOrCreate(IssuesClasses.ResolveErrors).data[originFile] = error.message;
  }

  /**
   * when a user uses core-extensions these core-extensions should not be dependencies.
   * here, we filter them out from all places they could entered as dependencies.
   * an exception is when running this method on bit-core-extensions themselves (dogfooding), in
   * which case we recognizes that the current originFile is a core-extension and avoid filtering.
   */
  private processCoreAspects(originFile: PathLinuxRelative) {
    const coreAspects = this.aspectLoader.getCoreAspectsPackagesAndIds();

    // const scopes = coreAspects.map((id) => {
    //   const id = id.split()
    // });

    const coreAspectIds = Object.values(coreAspects);
    if (coreAspectIds.includes(this.component.id.toStringWithoutVersion())) {
      return;
    }

    const coreAspectsPackages = Object.keys(coreAspects);

    const components = this.tree[originFile].components;
    const unidentifiedPackages = this.tree[originFile].unidentifiedPackages;
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

    this.tree[originFile].unidentifiedPackages = unidentifiedPackagesFiltered;
    this.tree[originFile].components = bitsFiltered;
    this.coreAspects.push(...uniq(usedCoreAspects));
  }

  /**
   * ** LEGACY ONLY **
   * This is related to a legacy feature "custom-module-resolution". the code was removed, only the debug is still there, just in case.
   *
   * ** OLD COMMENT **
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
  private processUnidentifiedPackages(originFile: PathLinuxRelative) {
    const unidentifiedPackages = this.tree[originFile].unidentifiedPackages;
    if (!unidentifiedPackages || !unidentifiedPackages.length) return;
    this.debugDependenciesData.unidentifiedPackages = unidentifiedPackages;
  }

  private _pushToDependenciesIfNotExist(dependency: Dependency, opts: PushToDepsArrayOpts) {
    const existingDependency = this.getExistingDependency(this.allDependencies.dependencies, dependency.id);
    const existingDevDependency = this.getExistingDependency(this.allDependencies.devDependencies, dependency.id);
    // no need to enter dev dependency to devDependencies if it exists already in dependencies
    if (existingDependency || (existingDevDependency && opts.fileType.isTestFile)) {
      return;
    }
    // at this point, either, it doesn't exist at all and should be entered.
    // or it exists in devDependencies but now it comes from non-dev file, which should be entered
    // as non-dev.
    this.pushToDependenciesArray(dependency, opts);
  }

  private pushToDependenciesArray(currentComponentsDeps: Dependency, opts: PushToDepsArrayOpts) {
    if (opts.fileType.isTestFile) {
      this.allDependencies.devDependencies.push(currentComponentsDeps);
    } else if (opts.isPeer) {
      this.allDependencies.peerDependencies.push(currentComponentsDeps);
    } else {
      this.allDependencies.dependencies.push(currentComponentsDeps);
    }
    this.debugDependenciesData.components.push(opts.depDebug);
  }

  private getExistingDependency(dependencies: Dependency[], id: ComponentID): Dependency | null | undefined {
    return dependencies.find((d) => d.id.isEqualWithoutVersion(id));
  }

  private getExistingDepRelativePaths(dependency: Dependency, relativePath: RelativePath) {
    if (!dependency.relativePaths || isEmpty(dependency.relativePaths)) return null;
    return dependency.relativePaths.find(
      (paths) =>
        paths.sourceRelativePath === relativePath.sourceRelativePath &&
        paths.destinationRelativePath === relativePath.destinationRelativePath
    );
  }

  private getDiffSpecifiers(originSpecifiers: ImportSpecifier[], targetSpecifiers: ImportSpecifier[]) {
    const cmp = (specifier1, specifier2) => specifier1.mainFile.name === specifier2.mainFile.name;
    return differenceWith(targetSpecifiers, originSpecifiers, cmp);
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
  private _addTypesPackagesForTypeScript(packageNames: string[], originFile: PathLinuxRelative): void {
    if (packageNames.length === 0) return;
    const isTypeScript = getExt(originFile) === 'ts' || getExt(originFile) === 'tsx';
    if (!isTypeScript) return;
    const depsHost = this.depsResolver.getWorkspacePolicyManifest();
    const addFromConfig = (packageName: string): boolean => {
      if (!depsHost) return false;
      return DEPENDENCIES_FIELDS.some((depField) => {
        if (!depsHost[depField]) return false;
        const typesPackage = packageToDefinetlyTyped(packageName);
        if (!depsHost[depField][typesPackage]) return false;
        Object.assign(this.allPackagesDependencies.devPackageDependencies, {
          [typesPackage]: depsHost[depField][typesPackage],
        });
        return true;
      });
    };
    const addFromModel = (packageName: string) => {
      if (!this.componentFromModel) return;
      const typesPackage = packageToDefinetlyTyped(packageName);
      const typedPackageFromModel = this.componentFromModel.devPackageDependencies[typesPackage];
      if (!typedPackageFromModel) return;
      Object.assign(this.allPackagesDependencies.devPackageDependencies, {
        [typesPackage]: typedPackageFromModel,
      });
    };

    packageNames.forEach((packageName) => {
      const added = addFromConfig(packageName);
      if (!added) addFromModel(packageName);
    });
  }

  private _pushToUntrackDependenciesIssues(originFile: PathLinuxRelative, depFileRelative, nested = false) {
    const findExisting = () => {
      let result;
      forEach(this.issues.getIssue(IssuesClasses.UntrackedDependencies)?.data || {}, (currentUntracked) => {
        const found = currentUntracked.untrackedFiles.find((file) => {
          return file.relativePath === depFileRelative;
        });
        if (found) {
          result = found;
        }
      });
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
  private _pushToRelativeComponentsAuthoredIssues(
    originFile,
    componentId: ComponentID,
    importSource: string,
    relativePath: RelativePath
  ) {
    (this.issues.getOrCreate(IssuesClasses.RelativeComponentsAuthored).data[originFile] ||= []).push({
      importSource,
      componentId,
      relativePath,
    });
  }
  private _pushToMissingDependenciesOnFs(originFile: PathLinuxRelative, missingFiles: string[]) {
    (this.issues.getOrCreate(IssuesClasses.MissingDependenciesOnFs).data[originFile] ||= []).push(...missingFiles);
  }
  private _pushToMissingPackagesDependenciesIssues(
    originFile: PathLinuxRelative,
    missingPackages: string[],
    fileType: FileType
  ) {
    const data = this.issues.getOrCreate(IssuesClasses.MissingPackagesDependenciesOnFs).data;
    const foundFile = data.find((file) => file.filePath === originFile);
    if (foundFile) {
      foundFile.missingPackages = uniq([...missingPackages, ...foundFile.missingPackages]);
    } else {
      data.push({ filePath: originFile, missingPackages, isDevFile: fileType.isTestFile });
    }
  }
}

/**
 * this is not necessarily a valid semver version. in case of a snap, it returns the hash only, not a valid semver.
 * this is for the ComponentID.version.
 */
export function getValidComponentVersion(version?: string): { version?: string; range?: string } {
  if (!version) {
    return { version: undefined };
  }
  if (version.startsWith(SNAP_VERSION_PREFIX)) {
    const versionWithoutSnapPrefix = version.replace(SNAP_VERSION_PREFIX, '');
    if (isSnap(versionWithoutSnapPrefix)) {
      return { version: versionWithoutSnapPrefix };
    }
  }
  if (semver.valid(version)) {
    // this takes care of pre-releases as well, as they're considered valid semver.
    return { version };
  }
  if (semver.validRange(version)) {
    // if this is a range, e.g. ^1.0.0, return a valid version: 1.0.0.
    const coerced = semver.coerce(version);
    if (coerced) {
      return { version: coerced.version, range: version };
    }
  }
  if (isSnap(version)) {
    return { version };
  }
  // it's probably a relative path to the component
  return { version: undefined };
}
