import path from 'path';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { cloneDeep, difference, forEach, isEmpty, pick, pickBy, uniq } from 'lodash';
import { IssuesList, IssuesClasses, MissingPackagesData } from '@teambit/component-issues';
import { DEPENDENCIES_FIELDS, MANUALLY_REMOVE_DEPENDENCY } from '@teambit/legacy/dist/constants';
import Component from '@teambit/legacy/dist/consumer/component/consumer-component';
import { PackageJsonFile } from '@teambit/component.sources';
import { PathLinux, resolvePackagePath } from '@teambit/legacy.utils';
import { ResolvedPackageData, resolvePackageData } from '../resolve-pkg-data';
import { Workspace } from '@teambit/workspace';
import { Dependency } from '@teambit/legacy/dist/consumer/component/dependencies';
import { DependencyResolverMain } from '@teambit/dependency-resolver';
import Consumer from '@teambit/legacy/dist/consumer/consumer';
import { ComponentMap } from '@teambit/legacy.bit-map';
import OverridesDependencies from './overrides-dependencies';
import { DependenciesData } from './dependencies-data';
import { DebugDependencies, FileType } from './auto-detect-deps';
import { Logger } from '@teambit/logger';

export type AllDependencies = {
  dependencies: Dependency[];
  devDependencies: Dependency[];
  peerDependencies: Dependency[];
};

export type AllPackagesDependencies = {
  packageDependencies: Record<string, string>;
  devPackageDependencies: Record<string, string>;
  peerPackageDependencies: Record<string, string>;
};

const DepsKeysToAllPackagesDepsKeys = {
  dependencies: 'packageDependencies',
  devDependencies: 'devPackageDependencies',
  peerDependencies: 'peerPackageDependencies',
};

export class ApplyOverrides {
  componentId: ComponentID;
  componentFromModel: Component;
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
  autoDetectOverrides: Record<string, any> | undefined;
  constructor(
    private component: Component,
    private depsResolver: DependencyResolverMain,
    private logger: Logger,
    private workspace?: Workspace
  ) {
    this.componentId = component.componentId;
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.componentFromModel = this.component.componentFromModel;
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
    this.setLegacyInsideHarmonyIssue();
    this.overridesDependencies = new OverridesDependencies(component);
    this.debugDependenciesData = { components: [] };
  }

  get consumer(): Consumer | undefined {
    return this.workspace?.consumer;
  }

  async getDependenciesData(): Promise<{
    dependenciesData: DependenciesData;
    overridesDependencies: OverridesDependencies;
    autoDetectOverrides?: Record<string, any>;
  }> {
    await this.populateDependencies();
    const dependenciesData = new DependenciesData(
      this.allDependencies,
      this.allPackagesDependencies,
      this.issues,
      this.coreAspects
    );
    return {
      dependenciesData,
      overridesDependencies: this.overridesDependencies,
      autoDetectOverrides: this.autoDetectOverrides,
    };
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
    this.removeIgnoredComponentsByOverrides();
    this.cloneAllPackagesDependencies();
    this.removeIgnoredPackagesByOverrides();
    this.removeDevAndEnvDepsIfTheyAlsoRegulars();
    this.applyPeersFromComponentModel();
    this.applyPackageJson();
    this.applyWorkspacePolicy();
    this.makeLegacyAsPeer();
    await this.applyAutoDetectOverridesOnComponent();
    // This was moved here (it used to be after this.manuallyAddDependencies) to fix an issue with a case where
    // an env define the same dependency defined by its own env, in both places:
    // its env.jsonc, and via bit deps set, with different versions.
    // before this fix the env.jsonc version was taken, and the deps set version was ignored for - bit show and
    // package.json
    // but it was taken into account for the actual dependency installation.
    // now we take the version from the deps set in both cases.
    // It make more sense to have it here before manually add dependencies, but the reason it wasn't like this is
    // because (pasting the original comment here):
    // ------ORIGINAL COMMENT------
    // Doing this here (after manuallyAddDependencies) because usually the env of the env is adding dependencies as peer of the env
    // which will make this not work if it come before
    // example:
    // custom react has peers with react 16.4.0.
    // the custom react uses the "teambit.envs/env" env, which will add react ^17.0.0 to every component that uses it
    // we want to make sure that the custom react is using 16.4.0 not 17.
    // ------END OF ORIGINAL COMMENT------
    // Since we did a massive refactor to the way we handle dependencies, we can now move it here now, as the original
    // issue doesn't seems like an issue any more.
    await this.applyAutoDetectedPeersFromEnvOnEnvItSelf();
    this.manuallyAddDependencies();
    // Doing this here (after manuallyAddDependencies) because usually the env of the env is adding dependencies as peer of the env
    // which will make this not work if it come before
    // example:
    // custom react has peers with react 16.4.0.
    // the custom react uses the "teambit.envs/env" env, which will add react ^17.0.0 to every component that uses it
    // we want to make sure that the custom react is using 16.4.0 not 17.
    this.coreAspects = uniq(this.coreAspects);
  }

  private removeIgnoredComponentsByOverrides() {
    const shouldBeIncluded = (dep: Dependency, fileType: FileType) =>
      !this.overridesDependencies.shouldIgnorePackage(dep.packageName as string, fileType);
    this.allDependencies.dependencies = this.allDependencies.dependencies.filter((dep) =>
      shouldBeIncluded(dep, { isTestFile: false })
    );
    this.allDependencies.devDependencies = this.allDependencies.devDependencies.filter((dep) =>
      shouldBeIncluded(dep, { isTestFile: true })
    );

    const missingIssue = this.issues.getIssueByName('MissingPackagesDependenciesOnFs');
    if (!missingIssue) return;
    const missingData = missingIssue.data as MissingPackagesData[];
    missingData.forEach((m) => {
      m.missingPackages = m.missingPackages.filter(
        (pkg) => !this.overridesDependencies.shouldIgnorePackage(pkg, { isTestFile: m.isDevFile })
      );
    });
    missingIssue.data = missingData.filter((m) => m.missingPackages.length);
    if (!missingIssue.data.length) this.issues.delete(IssuesClasses.MissingPackagesDependenciesOnFs);
  }

  private async loadAutoDetectOverrides() {
    this.autoDetectOverrides = await this.workspace?.getAutoDetectOverrides(
      this.component.extensions,
      this.component.id,
      this.component.files
    );
  }

  private cloneAllPackagesDependencies() {
    this.originAllPackagesDependencies = cloneDeep(this.allPackagesDependencies);
  }

  private removeIgnoredPackagesByOverrides() {
    const shouldBeIncluded = (pkgVersion, pkgName) =>
      !this.overridesDependencies.shouldIgnorePackageByType(pkgName, 'dependencies');
    const shouldBeIncludedDev = (pkgVersion, pkgName) =>
      !this.overridesDependencies.shouldIgnorePackageByType(pkgName, 'devDependencies');

    this.allPackagesDependencies.packageDependencies = pickBy(
      this.allPackagesDependencies.packageDependencies,
      shouldBeIncluded
    );
    this.allPackagesDependencies.devPackageDependencies = pickBy(
      this.allPackagesDependencies.devPackageDependencies,
      shouldBeIncludedDev
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
    const modulePath = resolvePackagePath(packageName, basePath, consumerPath);
    if (!modulePath) return undefined; // e.g. it's author and wasn't exported yet, so there's no node_modules of that component
    const packageObject = resolvePackageData(basePath, modulePath);
    return packageObject;
  }

  private _getComponentIdToAdd(
    dependency: string,
    versionRange: string
  ): { componentId?: ComponentID; packageName?: string; versionRange: string } {
    const packageData = this._resolvePackageData(dependency);
    return { componentId: packageData?.componentId, packageName: packageData?.name, versionRange };
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
        const componentData = this._getComponentIdToAdd(dependency, dependencyValue);
        if (componentData?.componentId) {
          if (componentData.componentId.isEqualWithoutVersion(this.componentId)) {
            this.logger.warn(
              `component ${this.componentId.toString()} depends on itself ${componentData.componentId.toString()}. ignoring it.`
            );
            return;
          }
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
          this.allDependencies[depField].push(
            new Dependency(depData.componentId, [], depData.packageName, depData.versionRange)
          )
        );
      }
      if (packages[depField] && !isEmpty(packages[depField])) {
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
    if (components.peerDependencies) {
      const componentPeers = new Set(components.peerDependencies.map(({ packageName }) => packageName));
      this.allDependencies.dependencies = this.allDependencies.dependencies.filter(
        (dep) => !dep.packageName || !componentPeers.has(dep.packageName)
      );
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
      difference(Object.keys(packages), Object.keys(this.allPackagesDependencies.packageDependencies));
    this.allPackagesDependencies.devPackageDependencies = pick(
      this.allPackagesDependencies.devPackageDependencies,
      getNotRegularPackages(this.allPackagesDependencies.devPackageDependencies)
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
    if (isEmpty(projectPeerDependencies)) return;

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
      forEach(this.allPackagesDependencies[field], (_pkgVal, pkgName) => {
        const peerVersionFromPkgJson = pkgJsonPeer[pkgName];
        const regularVersionFromPkgJson = pkgJsonRegularDeps[pkgName];
        if (peerVersionFromPkgJson) {
          delete this.allPackagesDependencies[field][pkgName];
          peerDeps[pkgName] = peerVersionFromPkgJson;
        } else if (regularVersionFromPkgJson) {
          delete this.allPackagesDependencies.peerPackageDependencies?.[pkgName];
          this.allPackagesDependencies[field][pkgName] = regularVersionFromPkgJson;
        }
      });
    });
    this.allPackagesDependencies.peerPackageDependencies = peerDeps;
  }

  private applyWorkspacePolicy(): void {
    const wsPolicy = this.depsResolver.getWorkspacePolicyManifest();
    if (!wsPolicy) return;
    const wsPeer = wsPolicy.peerDependencies || {};
    const wsRegular = wsPolicy.dependencies || {};
    const peerPackageDeps = this.allPackagesDependencies.peerPackageDependencies || {};
    // we are not iterate component deps since they are resolved from what actually installed
    // the policy used for installation only in that case
    ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].forEach((field) => {
      forEach(this.allPackagesDependencies[field], (_pkgVal, pkgName) => {
        const peerVersionFromWsPolicy = wsPeer[pkgName];
        const regularVersionFromWsPolicy = wsRegular[pkgName];
        if (peerVersionFromWsPolicy) {
          delete this.allPackagesDependencies[field][pkgName];
          peerPackageDeps[pkgName] = peerVersionFromWsPolicy;
        } else if (regularVersionFromWsPolicy) {
          delete this.allPackagesDependencies.peerPackageDependencies?.[pkgName];
          this.allPackagesDependencies[field][pkgName] = regularVersionFromWsPolicy;
        }
      });
    });
    this.allPackagesDependencies.peerPackageDependencies = peerPackageDeps;

    const peerDeps = this.allDependencies.peerDependencies ?? [];
    ['dependencies', 'devDependencies'].forEach((field) => {
      for (const dep of this.allDependencies[field]) {
        const pkgName = dep.packageName;
        const peerVersionFromWsPolicy = wsPeer[pkgName];
        const regularVersionFromWsPolicy = wsRegular[pkgName];
        if (peerVersionFromWsPolicy) {
          dep.versionRange = peerVersionFromWsPolicy;
          peerDeps.push(dep);
        } else if (regularVersionFromWsPolicy) {
          dep.versionRange = regularVersionFromWsPolicy;
        }
      }
      this.allDependencies[field] = this.allDependencies[field].filter(({ packageName }) => !wsPeer[packageName]);
    });
    this.allDependencies.peerDependencies = peerDeps;
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
    const missingData = this.issues.getIssueByName('MissingPackagesDependenciesOnFs')?.data as
      | MissingPackagesData[]
      | undefined;
    if (missingData) {
      missingPackages = uniq(missingData.map((d) => d.missingPackages).flat());
    }
    ['dependencies', 'devDependencies', 'peerDependencies'].forEach((field) => {
      forEach(autoDetectOverrides[field], (pkgVal, pkgName) => {
        if (this.overridesDependencies.shouldIgnorePeerPackage(pkgName)) return;
        // Validate it was auto detected, we only affect stuff that were detected
        const existsInCompsDeps = this.allDependencies.dependencies.find((dep) => {
          return dep.packageName === pkgName;
        });

        const existsInCompsDevDeps = this.allDependencies.devDependencies.find((dep) => {
          return dep.packageName === pkgName;
        });

        const existsInCompsPeerDeps = this.allDependencies.peerDependencies.find((dep) => {
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
          !existsInCompsPeerDeps &&
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
          if ((existsInCompsDeps || existsInCompsDevDeps) && field === 'peerDependencies') {
            const comp = (existsInCompsDeps ?? existsInCompsDevDeps) as Dependency;
            comp.versionRange = pkgVal;
            this.allDependencies.peerDependencies.push(comp);
          } else {
            this.allPackagesDependencies[key][pkgName] = pkgVal;
          }
          if (existsInCompsPeerDeps) {
            existsInCompsPeerDeps.versionRange = pkgVal;
          }
        }
      });
    });
  }

  private async applyAutoDetectedPeersFromEnvOnEnvItSelf(): Promise<void> {
    const envPolicy = await this.depsResolver.getEnvPolicyFromEnvId(this.component.id, this.component.files);
    if (!envPolicy) return;
    const envPolicyManifest = envPolicy.selfPolicy.toVersionManifest();

    if (!envPolicyManifest || !Object.keys(envPolicyManifest).length) {
      return;
    }
    const deps = this.allPackagesDependencies.packageDependencies || {};
    // we are not iterate component deps since they are resolved from what actually installed
    // the policy used for installation only in that case
    ['packageDependencies', 'devPackageDependencies', 'peerPackageDependencies'].forEach((field) => {
      forEach(this.allPackagesDependencies[field], (_pkgVal, pkgName) => {
        const peerVersionFromEnvPolicy = envPolicyManifest[pkgName];
        if (peerVersionFromEnvPolicy) {
          delete this.allPackagesDependencies[field][pkgName];
        }
      });
    });
    Object.assign(deps, envPolicyManifest);
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
