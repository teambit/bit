import R from 'ramda';
import path from 'path';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { union, cloneDeep } from 'lodash';
import { IssuesList, IssuesClasses } from '@teambit/component-issues';
import { Dependency } from '..';
import { DEPENDENCIES_FIELDS, MANUALLY_REMOVE_DEPENDENCY } from '../../../../constants';
import Component from '../../../component/consumer-component';
import { DependenciesTree } from '../files-dependency-builder/types/dependency-tree-type';
import OverridesDependencies from './overrides-dependencies';
import { DependenciesData } from './dependencies-data';
import PackageJsonFile from '../../../../consumer/component/package-json-file';
import { DependencyDetector } from '../files-dependency-builder/detector-hook';
import DependencyResolver from './dependencies-resolver';
import { ResolvedPackageData, resolvePackageData } from '../../../../utils/packages';
import { PathLinux } from '../../../../utils/path';
import Consumer from '../../../consumer';
import ComponentMap from '../../../bit-map/component-map';

export type AllDependencies = {
  dependencies: Dependency[];
  devDependencies: Dependency[];
};

export type AllPackagesDependencies = {
  packageDependencies: Record<string, string>;
  devPackageDependencies: Record<string, string>;
  peerPackageDependencies: Record<string, string>;
};

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

export type EnvPolicyForComponent = {
  dependencies: { [name: string]: string };
  devDependencies: { [name: string]: string };
  peerDependencies: { [name: string]: string };
};

const DepsKeysToAllPackagesDepsKeys = {
  dependencies: 'packageDependencies',
  devDependencies: 'devPackageDependencies',
  peerDependencies: 'peerPackageDependencies',
};

export class ApplyOverrides {
  componentId: ComponentID;
  componentFromModel: Component;
  tree: DependenciesTree;
  allDependencies: AllDependencies;
  allPackagesDependencies: AllPackagesDependencies;
  /**
   * This will store a copy of the package deps before removal
   * in order to apply auto detected rules that are running after the removal
   */
  originAllPackagesDependencies: AllPackagesDependencies;
  issues: IssuesList;
  coreAspects: string[] = [];
  processedFiles: string[];
  overridesDependencies: OverridesDependencies;
  debugDependenciesData: DebugDependencies;
  autoDetectOverrides: Record<string, any>;
  autoDetectConfigMerge: Record<string, any>;

  constructor(private component: Component, private consumer?: Consumer) {
    this.componentId = component.componentId;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentFromModel = this.component.componentFromModel;
    this.allDependencies = {
      dependencies: [],
      devDependencies: [],
    };
    this.allPackagesDependencies = {
      packageDependencies: {},
      devPackageDependencies: {},
      peerPackageDependencies: {},
    };
    this.processedFiles = [];
    this.issues = component.issues;
    this.setLegacyInsideHarmonyIssue();
    this.overridesDependencies = new OverridesDependencies(component);
    this.debugDependenciesData = { components: [] };
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
  async getDependenciesData(): Promise<DependenciesData> {
    await this.populateDependencies();
    return new DependenciesData(this.allDependencies, this.allPackagesDependencies, this.issues, this.coreAspects, {
      manuallyRemovedDependencies: this.overridesDependencies.manuallyRemovedDependencies,
      manuallyAddedDependencies: this.overridesDependencies.manuallyAddedDependencies,
      missingPackageDependencies: this.overridesDependencies.missingPackageDependencies,
    });
  }

  async getEnvDetectors(): Promise<DependencyDetector[] | null> {
    return DependencyResolver.envDetectorsGetter(this.component.extensions);
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
  private async populateDependencies() {
    await this.loadAutoDetectOverrides();
    await this.loadAutoDetectConfigMerge();

    this.cloneAllPackagesDependencies();

    this.removeIgnoredPackagesByOverrides();
    this.removeDevAndEnvDepsIfTheyAlsoRegulars();
    this.applyPeersFromComponentModel();
    this.applyPackageJson();
    this.applyWorkspacePolicy();
    this.makeLegacyAsPeer();
    await this.applyAutoDetectOverridesOnComponent();
    this.manuallyAddDependencies();
    // Doing this here (after manuallyAddDependencies) because usually the env of the env is adding dependencies as peer of the env
    // which will make this not work if it come before
    // example:
    // custom react has peers with react 16.4.0.
    // the custom react uses the "teambit.envs/env" env, which will add react ^17.0.0 to every component that uses it
    // we want to make sure that the custom react is using 16.4.0 not 17.
    await this.applyAutoDetectedPeersFromEnvOnEnvItSelf();

    this.coreAspects = R.uniq(this.coreAspects);
  }

  private async loadAutoDetectOverrides() {
    const autoDetectOverrides = await DependencyResolver.getOnComponentAutoDetectOverrides(
      this.component.extensions,
      this.component.id,
      this.component.files
    );
    this.autoDetectOverrides = autoDetectOverrides;
  }

  private async loadAutoDetectConfigMerge() {
    const autoDetectOverrides = await DependencyResolver.getOnComponentAutoDetectConfigMerge(this.component.id);
    this.autoDetectConfigMerge = autoDetectOverrides || {};
  }

  private cloneAllPackagesDependencies() {
    this.originAllPackagesDependencies = cloneDeep(this.allPackagesDependencies);
  }

  private removeIgnoredPackagesByOverrides() {
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
  }

  // TODO: maybe cache those results??
  private _resolvePackageData(packageName: string): ResolvedPackageData | undefined {
    const consumer = this.consumer;
    if (!consumer) return undefined;
    // if consumer is defined, then it has componentMap prop.
    const componentMap = this.component.componentMap as ComponentMap;
    const rootDir: PathLinux | null | undefined = componentMap.rootDir as string;
    const consumerPath = consumer.getPath();
    const basePath = rootDir ? path.join(consumerPath, rootDir) : consumerPath;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const modulePath = resolvePackagePath(packageName, basePath, consumerPath);
    if (!modulePath) return undefined; // e.g. it's author and wasn't exported yet, so there's no node_modules of that component
    const packageObject = resolvePackageData(basePath, modulePath);
    return packageObject;
  }

  private _getComponentIdToAdd(
    field: string,
    dependency: string
  ): { componentId?: ComponentID; packageName?: string } | undefined {
    if (field === 'peerDependencies') return undefined;
    const packageData = this._resolvePackageData(dependency);
    return { componentId: packageData?.componentId, packageName: packageData?.name };
  }

  getDependenciesToAddManually(
    packageJson: Record<string, any> | null | undefined,
    existingDependencies: AllDependencies
  ): { components: Record<string, any>; packages: Record<string, any> } | undefined {
    const overrides = this.overridesDependencies.getDependenciesToAddManually();
    if (!overrides) return undefined;
    const components = {};
    const packages = {};
    DEPENDENCIES_FIELDS.forEach((depField) => {
      if (!overrides[depField]) return;
      Object.keys(overrides[depField]).forEach((dependency) => {
        const dependencyValue = overrides[depField][dependency];
        const componentData = this._getComponentIdToAdd(depField, dependency);
        if (componentData?.componentId) {
          const dependencyExist = existingDependencies[depField].find((d) =>
            d.id.isEqualWithoutVersion(componentData.componentId)
          );
          if (!dependencyExist) {
            this.overridesDependencies._addManuallyAddedDep(depField, componentData.componentId.toString());
            components[depField] ? components[depField].push(componentData) : (components[depField] = [componentData]);
          }
          return;
        }
        const addedPkg = this.overridesDependencies._manuallyAddPackage(
          depField,
          dependency,
          dependencyValue,
          packageJson
        );
        if (addedPkg) {
          packages[depField] = Object.assign(packages[depField] || {}, addedPkg);
          if (componentData && !componentData.packageName) {
            this.overridesDependencies.missingPackageDependencies.push(dependency);
          }
        }
      });
    });
    return { components, packages };
  }

  private manuallyAddDependencies() {
    const packageJson = this._getPackageJson();
    const dependencies = this.getDependenciesToAddManually(packageJson, this.allDependencies);
    if (!dependencies) return;
    const { components, packages } = dependencies;
    DEPENDENCIES_FIELDS.forEach((depField) => {
      if (components[depField] && components[depField].length) {
        components[depField].forEach((depData) =>
          this.allDependencies[depField].push(new Dependency(depData.componentId, [], depData.packageName))
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

  /**
   * Remove the dependencies which appear both in dev and regular deps from the dev
   * Because if a dependency is both dev dependency and regular dependency it should be treated as regular one
   * Apply for both packages and components dependencies
   */
  private removeDevAndEnvDepsIfTheyAlsoRegulars() {
    // remove dev and env packages that are also regular packages
    const getNotRegularPackages = (packages) =>
      R.difference(R.keys(packages), R.keys(this.allPackagesDependencies.packageDependencies));
    this.allPackagesDependencies.devPackageDependencies = R.pick(
      getNotRegularPackages(this.allPackagesDependencies.devPackageDependencies),
      this.allPackagesDependencies.devPackageDependencies
    );
    // remove dev dependencies that are also regular dependencies
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentDepsIds = new ComponentIdList(...this.allDependencies.dependencies.map((c) => c.id));
    this.allDependencies.devDependencies = this.allDependencies.devDependencies.filter(
      (d) => !componentDepsIds.has(d.id)
    );
  }

  private applyPeersFromComponentModel(): void {
    const getPeerDependencies = (): Record<string, any> => {
      const packageJson = this._getPackageJsonFromComponentModel();
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

  private applyPackageJson(): void {
    const packageJson = this._getPackageJson();
    if (!packageJson) return;
    const pkgJsonPeer = packageJson.peerDependencies || {};
    const pkgJsonRegularDeps = packageJson.dependencies || {};
    const peerDeps = this.allPackagesDependencies.peerPackageDependencies || {};
    ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].forEach((field) => {
      R.forEachObjIndexed((_pkgVal, pkgName) => {
        const peerVersionFromPkgJson = pkgJsonPeer[pkgName];
        const regularVersionFromPkgJson = pkgJsonRegularDeps[pkgName];
        if (peerVersionFromPkgJson) {
          delete this.allPackagesDependencies[field][pkgName];
          peerDeps[pkgName] = peerVersionFromPkgJson;
        } else if (regularVersionFromPkgJson) {
          delete this.allPackagesDependencies.peerPackageDependencies?.[pkgName];
          this.allPackagesDependencies[field][pkgName] = regularVersionFromPkgJson;
        }
      }, this.allPackagesDependencies[field]);
    });
    this.allPackagesDependencies.peerPackageDependencies = peerDeps;
  }

  private applyWorkspacePolicy(): void {
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
          delete this.allPackagesDependencies.peerPackageDependencies?.[pkgName];
          this.allPackagesDependencies[field][pkgName] = regularVersionFromWsPolicy;
        }
      }, this.allPackagesDependencies[field]);
    });
    this.allPackagesDependencies.peerPackageDependencies = peerDeps;
  }

  /**
   * It removes the @teambit/legacy dependency from the dependencies/devDeps and adds it as a peer dependency with ^.
   */
  private makeLegacyAsPeer(): void {
    let version;
    if (this.allPackagesDependencies.packageDependencies['@teambit/legacy']) {
      version = this.allPackagesDependencies.packageDependencies['@teambit/legacy'];
      delete this.allPackagesDependencies.packageDependencies['@teambit/legacy'];
    }
    if (this.allPackagesDependencies.devPackageDependencies['@teambit/legacy']) {
      if (!version) version = this.allPackagesDependencies.devPackageDependencies['@teambit/legacy'];
      delete this.allPackagesDependencies.devPackageDependencies['@teambit/legacy'];
    }
    if (version) {
      if (!Number.isNaN(version[0])) version = `^${version}`;
      this.allPackagesDependencies.peerPackageDependencies['@teambit/legacy'] = version;
    }
  }

  private async applyAutoDetectOverridesOnComponent(): Promise<void> {
    const autoDetectOverrides = this.autoDetectOverrides;

    if (!autoDetectOverrides || !Object.keys(autoDetectOverrides).length) {
      return;
    }

    const originallyExists: string[] = [];
    let missingPackages: string[] = [];
    // We want to also add missing packages to the peer list as we know to resolve the version from the env anyway
    // @ts-ignore
    const missingData = this.issues.getIssueByName<IssuesClasses.MissingPackagesDependenciesOnFs>(
      'MissingPackagesDependenciesOnFs'
    )?.data;
    if (missingData) {
      // @ts-ignore
      missingPackages = union(...(Object.values(missingData) || []));
    }
    ['dependencies', 'devDependencies', 'peerDependencies'].forEach((field) => {
      R.forEachObjIndexed((pkgVal, pkgName) => {
        if (this.overridesDependencies.shouldIgnorePeerPackage(pkgName)) return;
        // Validate it was auto detected, we only affect stuff that were detected
        const existsInCompsDeps = this.allDependencies.dependencies.find((dep) => {
          return dep.packageName === pkgName;
        });

        const existsInCompsDevDeps = this.allDependencies.devDependencies.find((dep) => {
          return dep.packageName === pkgName;
        });

        if (
          // We are checking originAllPackagesDependencies instead of allPackagesDependencies
          // as it might be already removed from allPackagesDependencies at this point if it was set with
          // "-" in runtime/dev
          // in such case we still want to apply it here
          !this.originAllPackagesDependencies.packageDependencies[pkgName] &&
          !this.originAllPackagesDependencies.devPackageDependencies[pkgName] &&
          !this.originAllPackagesDependencies.peerPackageDependencies[pkgName] &&
          !existsInCompsDeps &&
          !existsInCompsDevDeps &&
          // Check if it was orignally exists in the component
          // as we might have a policy which looks like this:
          // "components": {
          //   "dependencies": {
          //       "my-dep": "-"
          //    },
          //   "devDependencies": {
          //       "my-dep": "1.0.0"
          //    },
          // }
          // in that case we might remove it before getting to the devDeps then we will think that it wasn't required in the component
          // which is incorrect
          !originallyExists.includes(pkgName) &&
          !missingPackages.includes(pkgName)
        ) {
          return;
        }
        originallyExists.push(pkgName);
        const key = DepsKeysToAllPackagesDepsKeys[field];

        delete this.allPackagesDependencies[key][pkgName];
        // When changing peer dependency we want it to be stronger than the other types
        if (field === 'peerDependencies') {
          delete this.allPackagesDependencies.devPackageDependencies[pkgName];
          delete this.allPackagesDependencies.packageDependencies[pkgName];
          if (existsInCompsDeps) {
            this.allDependencies.dependencies = this.allDependencies.dependencies.filter(
              (dep) => dep.packageName !== pkgName
            );
          }
          if (existsInCompsDevDeps) {
            this.allDependencies.devDependencies = this.allDependencies.devDependencies.filter(
              (dep) => dep.packageName !== pkgName
            );
          }
        }
        // delete this.allPackagesDependencies.packageDependencies[pkgName];
        // delete this.allPackagesDependencies.devPackageDependencies[pkgName];
        // delete this.allPackagesDependencies.peerPackageDependencies[pkgName];

        // If it exists in comps deps / comp dev deps, we don't want to add it to the allPackagesDependencies
        // as it will make the same dep both a dev and runtime dep
        // since we are here only for auto detected deps, it means we already resolved the version correctly
        // so we don't need to really modify the version
        // also the version here might have a range (^ or ~ for example) so we can't
        // just put it as is, as it is not valid for component deps to have range
        if (
          pkgVal !== MANUALLY_REMOVE_DEPENDENCY &&
          ((!existsInCompsDeps && !existsInCompsDevDeps) || field === 'peerDependencies')
        ) {
          this.allPackagesDependencies[key][pkgName] = pkgVal;
        }
      }, autoDetectOverrides[field]);
    });
  }

  private async applyAutoDetectedPeersFromEnvOnEnvItSelf(): Promise<void> {
    const envPolicy = await DependencyResolver.getHarmonyEnvPeersPolicyForEnvItself(
      this.component.id,
      this.component.files
    );
    if (!envPolicy || !Object.keys(envPolicy).length) {
      return;
    }
    const deps = this.allPackagesDependencies.packageDependencies || {};
    // we are not iterate component deps since they are resolved from what actually installed
    // the policy used for installation only in that case
    ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].forEach((field) => {
      R.forEachObjIndexed((_pkgVal, pkgName) => {
        const peerVersionFromEnvPolicy = envPolicy[pkgName];
        if (peerVersionFromEnvPolicy) {
          delete this.allPackagesDependencies[field][pkgName];
        }
      }, this.allPackagesDependencies[field]);
    });
    Object.assign(deps, envPolicy);
    // TODO: handle component deps once we support peers between components
    this.allPackagesDependencies.packageDependencies = deps;
  }

  /**
   * returns `package.json` of the component when it's imported, or `package.json` of the workspace
   * when it's authored.
   */
  private _getPackageJson(): Record<string, any> | undefined {
    return this.consumer?.packageJson.packageJsonObject;
  }

  private _getPackageJsonFromComponentModel(): Record<string, any> | undefined {
    if (this.componentFromModel && this.component.componentMap) {
      // a component is imported but the package.json file is missing or never written
      // read the values from the model
      const packageJson = PackageJsonFile.createFromComponent(
        this.component.componentMap.rootDir,
        this.componentFromModel
      );
      return packageJson.packageJsonObject;
    }
    return undefined;
  }

  private setLegacyInsideHarmonyIssue() {
    if (this.componentFromModel && this.componentFromModel.isLegacy) {
      this.issues.getOrCreate(IssuesClasses.LegacyInsideHarmony).data = true;
    }
  }

  private _pkgFieldMapping(field: string) {
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
}
