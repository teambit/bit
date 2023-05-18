import fs, { pathExists } from 'fs-extra';
import path from 'path';
import { getRootComponentDir, getBitRootsDir, linkPkgsToBitRoots } from '@teambit/bit-roots';
import { CompilerMain, CompilerAspect, CompilationInitiator } from '@teambit/compiler';
import { CLIMain, CommandList, CLIAspect, MainRuntime } from '@teambit/cli';
import chalk from 'chalk';
import { WorkspaceAspect, Workspace, ComponentConfigFile } from '@teambit/workspace';
import { compact, mapValues, omit, uniq, pick } from 'lodash';
import { ProjectManifest } from '@pnpm/types';
import { BitError } from '@teambit/bit-error';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { ApplicationMain, ApplicationAspect } from '@teambit/application';
import { VariantsMain, Patterns, VariantsAspect } from '@teambit/variants';
import { Component, ComponentID, ComponentMap } from '@teambit/component';
import pMapSeries from 'p-map-series';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { linkToNodeModulesWithCodemod, NodeModulesLinksResult } from '@teambit/workspace.modules.node-modules-linker';
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { IssuesClasses } from '@teambit/component-issues';
import {
  GetComponentManifestsOptions,
  WorkspaceDependencyLifecycleType,
  DependencyResolverMain,
  DependencyInstaller,
  DependencyResolverAspect,
  PackageManagerInstallOptions,
  ComponentDependency,
  VariantPolicyConfigObject,
  WorkspacePolicyEntry,
  LinkingOptions,
  LinkResults,
  DependencyLinker,
  DependencyList,
  OutdatedPkg,
  WorkspacePolicy,
} from '@teambit/dependency-resolver';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { IssuesAspect, IssuesMain } from '@teambit/issues';
import { CodemodResult } from '@teambit/legacy/dist/consumer/component-ops/codemod-components';
import hash from 'object-hash';
import { DependencyTypeNotSupportedInPolicy } from './exceptions';
import { InstallAspect } from './install.aspect';
import { pickOutdatedPkgs } from './pick-outdated-pkgs';
import { LinkCommand } from './link';
import InstallCmd from './install.cmd';
import UninstallCmd from './uninstall.cmd';
import UpdateCmd from './update.cmd';

export type WorkspaceLinkOptions = LinkingOptions & {
  rootPolicy?: WorkspacePolicy;
  linkToBitRoots?: boolean;
};

export type WorkspaceLinkResults = {
  legacyLinkResults?: NodeModulesLinksResult[];
  legacyLinkCodemodResults?: CodemodResult[];
} & LinkResults;

export type WorkspaceInstallOptions = {
  addMissingDeps?: boolean;
  addMissingPeers?: boolean;
  variants?: string;
  lifecycleType?: WorkspaceDependencyLifecycleType;
  dedupe?: boolean;
  import?: boolean;
  copyPeerToRuntimeOnRoot?: boolean;
  copyPeerToRuntimeOnComponents?: boolean;
  updateExisting?: boolean;
  savePrefix?: string;
  compile?: boolean;
  includeOptionalDeps?: boolean;
  updateAll?: boolean;
};

export type ModulesInstallOptions = Omit<WorkspaceInstallOptions, 'updateExisting' | 'lifecycleType' | 'import'>;

type PreLink = (linkOpts?: WorkspaceLinkOptions) => Promise<void>;
type PreInstall = (installOpts?: WorkspaceInstallOptions) => Promise<void>;

type PreLinkSlot = SlotRegistry<PreLink>;
type PreInstallSlot = SlotRegistry<PreInstall>;

type GetComponentsAndManifestsOptions = Omit<
  GetComponentManifestsOptions,
  'componentDirectoryMap' | 'rootPolicy' | 'rootDir'
> &
  Pick<PackageManagerInstallOptions, 'nodeLinker'>;

export class InstallMain {
  private visitedAspects: Set<string> = new Set();

  constructor(
    private dependencyResolver: DependencyResolverMain,

    private logger: Logger,

    private workspace: Workspace,

    private variants: VariantsMain,

    private compiler: CompilerMain,

    private envs: EnvsMain,

    private app: ApplicationMain,

    private preLinkSlot: PreLinkSlot,

    private preInstallSlot: PreInstallSlot
  ) {}
  /**
   * Install dependencies for all components in the workspace
   *
   * @returns
   * @memberof Workspace
   */
  async install(packages?: string[], options?: WorkspaceInstallOptions): Promise<ComponentMap<string>> {
    // set workspace in install context
    this.workspace.inInstallContext = true;
    if (packages && packages.length) {
      await this._addPackages(packages, options);
    }
    if (options?.addMissingPeers) {
      const compDirMap = await this.getComponentsDirectory([]);
      const mergedRootPolicy = this.dependencyResolver.getWorkspacePolicy();
      const depsFilterFn = await this.generateFilterFnForDepsFromLocalRemote();
      const pmInstallOptions: PackageManagerInstallOptions = {
        dedupe: options?.dedupe,
        copyPeerToRuntimeOnRoot: options?.copyPeerToRuntimeOnRoot ?? true,
        copyPeerToRuntimeOnComponents: options?.copyPeerToRuntimeOnComponents ?? false,
        dependencyFilterFn: depsFilterFn,
        overrides: this.dependencyResolver.config.overrides,
        packageImportMethod: this.dependencyResolver.config.packageImportMethod,
      };
      const missingPeers = await this.dependencyResolver.getMissingPeerDependencies(
        this.workspace.path,
        mergedRootPolicy,
        compDirMap,
        pmInstallOptions
      );
      if (missingPeers) {
        const missingPeerPackages = Object.entries(missingPeers).map(([peerName, range]) => `${peerName}@${range}`);
        await this._addPackages(missingPeerPackages, options);
      } else {
        this.logger.console('No missing peer dependencies found.');
      }
    }
    await pMapSeries(this.preInstallSlot.values(), (fn) => fn(options)); // import objects if not disabled in options
    const res = await this._installModules(options);
    this.workspace.inInstallContext = false;
    return res;
  }

  registerPreLink(fn: PreLink) {
    this.preLinkSlot.register(fn);
  }

  registerPreInstall(fn: PreInstall) {
    this.preInstallSlot.register(fn);
  }

  private async _addPackages(packages: string[], options?: WorkspaceInstallOptions) {
    if (!options?.variants && (options?.lifecycleType as string) === 'dev') {
      throw new DependencyTypeNotSupportedInPolicy(options?.lifecycleType as string);
    }
    this.logger.debug(`installing the following packages: ${packages.join()}`);
    const resolver = await this.dependencyResolver.getVersionResolver();
    const resolvedPackagesP = packages.map((packageName) =>
      resolver.resolveRemoteVersion(packageName, {
        rootDir: this.workspace.path,
      })
    );
    const resolvedPackages = await Promise.all(resolvedPackagesP);
    const newWorkspacePolicyEntries: WorkspacePolicyEntry[] = [];
    resolvedPackages.forEach((resolvedPackage) => {
      if (resolvedPackage.version) {
        const versionWithPrefix = this.dependencyResolver.getVersionWithSavePrefix({
          version: resolvedPackage.version,
          overridePrefix: options?.savePrefix,
          wantedRange: resolvedPackage.wantedRange,
        });
        newWorkspacePolicyEntries.push({
          dependencyId: resolvedPackage.packageName,
          value: {
            version: versionWithPrefix,
          },
          lifecycleType: options?.lifecycleType || 'runtime',
        });
      }
    });
    if (!options?.variants) {
      this.dependencyResolver.addToRootPolicy(newWorkspacePolicyEntries, {
        updateExisting: options?.updateExisting ?? false,
      });
    } else {
      // TODO: implement
    }
    await this.dependencyResolver.persistConfig(this.workspace.path);
  }

  private async _installModules(options?: ModulesInstallOptions): Promise<ComponentMap<string>> {
    const pm = this.dependencyResolver.getPackageManager();
    this.logger.console(
      `installing dependencies in workspace using ${pm?.name} (${chalk.cyan(
        this.dependencyResolver.getPackageManagerName()
      )})`
    );
    this.logger.debug(`installing dependencies in workspace with options`, options);
    const depsFilterFn = await this.generateFilterFnForDepsFromLocalRemote();
    const hasRootComponents = this.dependencyResolver.hasRootComponents();
    // TODO: pass get install options
    const installer = this.dependencyResolver.getInstaller({});
    const calcManifestsOpts: GetComponentsAndManifestsOptions = {
      copyPeerToRuntimeOnComponents: options?.copyPeerToRuntimeOnComponents ?? false,
      copyPeerToRuntimeOnRoot: options?.copyPeerToRuntimeOnRoot ?? true,
      dedupe: !hasRootComponents && options?.dedupe,
      dependencyFilterFn: depsFilterFn,
      nodeLinker: this.dependencyResolver.nodeLinker(),
    };
    // eslint-disable-next-line prefer-const
    let { mergedRootPolicy, componentsAndManifests: current } = await this._getComponentsManifestsAndRootPolicy(
      installer,
      {
        ...calcManifestsOpts,
        addMissingDeps: options?.addMissingDeps,
      }
    );
    const pmInstallOptions: PackageManagerInstallOptions = {
      ...calcManifestsOpts,
      includeOptionalDeps: options?.includeOptionalDeps,
      neverBuiltDependencies: this.dependencyResolver.config.neverBuiltDependencies,
      overrides: this.dependencyResolver.config.overrides,
      packageImportMethod: this.dependencyResolver.config.packageImportMethod,
      rootComponents: hasRootComponents,
      updateAll: options?.updateAll,
    };
    const prevManifests = new Set<string>();
    // TODO: this make duplicate
    // this.logger.consoleSuccess();
    // TODO: add the links results to the output
    const linkOpts = {
      linkTeambitBit: true,
      linkCoreAspects: this.dependencyResolver.linkCoreAspects(),
      linkDepsResolvedFromEnv: !hasRootComponents,
      linkNestedDepsInNM: !this.workspace.isLegacy && !hasRootComponents,
    };
    const { linkedRootDeps } = await this.calculateLinks(linkOpts);
    const linkedDependencies = {
      [this.workspace.path]: linkedRootDeps,
    };
    const compDirMap = await this.getComponentsDirectory([]);
    let installCycle = 0;
    let hasMissingLocalComponents = true;
    /* eslint-disable no-await-in-loop */
    do {
      // In case there are missing local components,
      // we'll need to make another round of installation as on the first round the missing local components
      // are not added to the manifests.
      // This is an issue when installation is done using root components.
      hasMissingLocalComponents = hasRootComponents && hasComponentsFromWorkspaceInMissingDeps(current);
      const { dependenciesChanged } = await installer.installComponents(
        this.workspace.path,
        current.manifests,
        mergedRootPolicy,
        current.componentDirectoryMap,
        {
          linkedDependencies,
          installTeambitBit: false,
        },
        pmInstallOptions
      );
      if (options?.compile) {
        const compileStartTime = process.hrtime();
        const compileOutputMessage = `compiling components`;
        this.logger.setStatusLine(compileOutputMessage);
        await this.compiler.compileOnWorkspace([], { initiator: CompilationInitiator.Install });
        this.logger.consoleSuccess(compileOutputMessage, compileStartTime);
      }
      await this.linkCodemods(compDirMap);
      if (!dependenciesChanged) break;
      prevManifests.add(manifestsHash(current.manifests));
      // We need to clear cache before creating the new component manifests.
      this.workspace.consumer.componentLoader.clearComponentsCache();
      this.workspace.clearCache();
      current = await this._getComponentsManifests(installer, mergedRootPolicy, calcManifestsOpts);
      installCycle += 1;
    } while ((!prevManifests.has(manifestsHash(current.manifests)) || hasMissingLocalComponents) && installCycle < 5);
    // We clean node_modules only after the last install.
    // Otherwise, we might load an env from a location that we later remove.
    await installer.pruneModules(this.workspace.path);
    await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
    /* eslint-enable no-await-in-loop */
    return current.componentDirectoryMap;
  }

  private async _getComponentsManifestsAndRootPolicy(
    installer: DependencyInstaller,
    options: GetComponentsAndManifestsOptions & {
      addMissingDeps?: boolean;
    }
  ): Promise<{ componentsAndManifests: ComponentsAndManifests; mergedRootPolicy: WorkspacePolicy }> {
    const mergedRootPolicy = await this.addConfiguredAspectsToWorkspacePolicy();
    const componentsAndManifests = await this._getComponentsManifests(installer, mergedRootPolicy, options);
    if (!options?.addMissingDeps) {
      return { componentsAndManifests, mergedRootPolicy };
    }
    const addedNewPkgs = await this._addMissingPackagesToRootPolicy(
      componentsAndManifests.manifests[this.workspace.path]
    );
    if (!addedNewPkgs) {
      return { componentsAndManifests, mergedRootPolicy };
    }
    const mergedRootPolicyWithMissingDeps = await this.addConfiguredAspectsToWorkspacePolicy();
    return {
      mergedRootPolicy: mergedRootPolicyWithMissingDeps,
      componentsAndManifests: await this._getComponentsManifests(installer, mergedRootPolicyWithMissingDeps, options),
    };
  }

  private async addConfiguredAspectsToWorkspacePolicy(): Promise<WorkspacePolicy> {
    const rootPolicy = this.dependencyResolver.getWorkspacePolicy();
    const aspectsPackages = await this.workspace.getConfiguredUserAspectsPackages({ externalsOnly: true });
    aspectsPackages.forEach((aspectsPackage) => {
      rootPolicy.add({
        dependencyId: aspectsPackage.packageName,
        value: {
          version: aspectsPackage.version,
        },
        lifecycleType: 'runtime',
      });
    });
    return rootPolicy;
  }

  private async _addMissingPackagesToRootPolicy(
    rootManifest: ProjectManifest,
    options?: WorkspaceInstallOptions
  ): Promise<boolean> {
    const packages = await this._getMissingPackagesWithoutRootDeps(rootManifest);
    if (packages && packages.length) {
      await this._addPackages(packages, options);
    }
    return packages.length > 0;
  }

  private async _getMissingPackagesWithoutRootDeps(rootManifest: ProjectManifest) {
    const packages = await this._getAllMissingPackages();
    const rootDeps = {
      ...rootManifest?.devDependencies,
      ...rootManifest?.dependencies,
    };
    return packages.filter((pkg) => !rootDeps[pkg]);
  }

  private async _getAllMissingPackages(): Promise<string[]> {
    const comps = await this.workspace.list();
    return uniq(
      comps
        .map((comp) =>
          Object.values(comp.state.issues.getOrCreate(IssuesClasses.MissingPackagesDependenciesOnFs).data).flat()
        )
        .flat()
    );
  }

  private async _getComponentsManifests(
    dependencyInstaller: DependencyInstaller,
    rootPolicy: WorkspacePolicy,
    installOptions: GetComponentsAndManifestsOptions
  ): Promise<ComponentsAndManifests> {
    const componentDirectoryMap = await this.getComponentsDirectory([]);
    let manifests = await dependencyInstaller.getComponentManifests({
      ...installOptions,
      componentDirectoryMap,
      rootPolicy,
      rootDir: this.workspace.path,
      referenceLocalPackages: this.dependencyResolver.hasRootComponents() && installOptions.nodeLinker === 'isolated',
    });

    if (this.dependencyResolver.hasRootComponents()) {
      const rootManifests = await this._getRootManifests(manifests);
      await this._updateRootDirs(Object.keys(rootManifests));
      manifests = {
        ...manifests,
        ...rootManifests,
      };
    }
    return {
      componentDirectoryMap,
      manifests,
    };
  }

  private async _updateRootDirs(rootDirs: string[]) {
    try {
      const bitRootCompsDir = getBitRootsDir(this.workspace.path);
      const existingDirs = await fs.readdir(bitRootCompsDir);
      await Promise.all(
        existingDirs.map(async (dirName) => {
          const dirPath = path.join(bitRootCompsDir, dirName);
          if (!rootDirs.includes(dirPath)) {
            await fs.remove(dirPath);
          }
        })
      );
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
    await Promise.all(rootDirs.map((dirPath) => fs.mkdir(dirPath, { recursive: true })));
  }

  private async _getRootManifests(
    manifests: Record<string, ProjectManifest>
  ): Promise<Record<string, ProjectManifest>> {
    const nonRootManifests = Object.values(manifests).filter(({ name }) => name !== 'workspace');
    const workspaceDeps = this.dependencyResolver.getWorkspaceDepsOfBitRoots(nonRootManifests);
    const workspaceDepsMeta = Object.keys(workspaceDeps).reduce((acc, depName) => {
      acc[depName] = { injected: true };
      return acc;
    }, {});
    const envManifests = await this._getEnvManifests(workspaceDeps, workspaceDepsMeta);
    const appManifests = await this._getAppManifests(manifests, workspaceDeps, workspaceDepsMeta);
    return {
      ...envManifests,
      ...appManifests,
    };
  }

  private async _getEnvManifests(
    workspaceDeps: Record<string, string>,
    workspaceDepsMeta: Record<string, { injected: true }>
  ): Promise<Record<string, ProjectManifest>> {
    const envs = await this._getAllUsedEnvIds();
    return Object.fromEntries(
      await Promise.all(
        envs.map(async (envId) => {
          return [
            getRootComponentDir(this.workspace.path, envId.toString()),
            {
              dependencies: {
                ...(await this._getEnvDependencies(envId)),
                ...workspaceDeps,
                ...(await this._getEnvPackage(envId)),
              },
              dependenciesMeta: workspaceDepsMeta,
              installConfig: {
                hoistingLimits: 'workspaces',
              },
            },
          ];
        })
      )
    );
  }

  private async _getEnvDependencies(envId: ComponentID): Promise<Record<string, string>> {
    const policy = await this.dependencyResolver.getEnvPolicyFromEnvId(envId);
    if (!policy) return {};
    return Object.fromEntries(
      policy.selfPolicy.entries
        .filter(({ force, value }) => force && value.version !== '-')
        .map(({ dependencyId, value }) => [dependencyId, value.version])
    );
  }

  /**
   * Return the package name of the env with its version.
   * (only if the env is not a core env and is not in the workspace)
   * @param envId
   * @returns
   */
  private async _getEnvPackage(envId: ComponentID): Promise<Record<string, string> | undefined> {
    if (this.envs.isCoreEnv(envId.toStringWithoutVersion())) return undefined;
    const inWs = await this.workspace.hasId(envId);
    if (inWs) return undefined;
    const envComponent = await this.envs.getEnvComponentByEnvId(envId.toString(), envId.toString());
    if (!envComponent) return undefined;
    const packageName = this.dependencyResolver.getPackageName(envComponent);
    const version = envId.version;
    return { [packageName]: version };
  }

  private async _getAppManifests(
    manifests: Record<string, ProjectManifest>,
    workspaceDeps: Record<string, string>,
    workspaceDepsMeta: Record<string, { injected: true }>
  ): Promise<Record<string, ProjectManifest>> {
    return Object.fromEntries(
      compact(
        await Promise.all(
          (
            await this.app.listAppsFromComponents()
          ).map(async (app) => {
            const appPkgName = this.dependencyResolver.getPackageName(app);
            const appManifest = Object.values(manifests).find(({ name }) => name === appPkgName);
            if (!appManifest) return null;
            const envId = await this.envs.calculateEnvId(app);
            return [
              getRootComponentDir(this.workspace.path, app.id.toString()),
              {
                ...omit(appManifest, ['name', 'version']),
                dependencies: {
                  ...(await this._getEnvDependencies(envId)),
                  ...appManifest.dependencies,
                  ...workspaceDeps,
                },
                dependenciesMeta: {
                  ...appManifest.dependenciesMeta,
                  ...workspaceDepsMeta,
                },
                installConfig: {
                  hoistingLimits: 'workspaces',
                },
              },
            ];
          })
        )
      )
    );
  }

  private async _getAllUsedEnvIds(): Promise<ComponentID[]> {
    const envs = new Set<ComponentID>();
    const components = await this.workspace.list();
    await pMapSeries(components, async (component) => {
      envs.add(await this.envs.calculateEnvId(component));
    });
    return Array.from(envs.values());
  }

  /**
   * Updates out-of-date dependencies in the workspace.
   *
   * @param options.all {Boolean} updates all outdated dependencies without showing a prompt.
   */
  async updateDependencies(options: { all: boolean }) {
    const { componentConfigFiles, componentPoliciesById } = await this._getComponentsWithDependencyPolicies();
    const variantPatterns = this.variants.raw();
    const variantPoliciesByPatterns = this._variantPatternsToDepPolicesDict(variantPatterns);
    const components = await this.workspace.list();
    const outdatedPkgs = await this.dependencyResolver.getOutdatedPkgsFromPolicies({
      rootDir: this.workspace.path,
      variantPoliciesByPatterns,
      componentPoliciesById,
      components,
    });
    let outdatedPkgsToUpdate!: OutdatedPkg[];
    if (options.all) {
      outdatedPkgsToUpdate = outdatedPkgs;
    } else {
      this.logger.off();
      outdatedPkgsToUpdate = await pickOutdatedPkgs(outdatedPkgs);
      this.logger.on();
    }
    const { updatedVariants, updatedComponents } = this.dependencyResolver.applyUpdates(outdatedPkgsToUpdate, {
      variantPoliciesByPatterns,
      componentPoliciesById,
    });
    await this._updateVariantsPolicies(variantPatterns, updatedVariants);
    const updatedComponentConfigFiles = Object.values(pick(componentConfigFiles, updatedComponents));
    await this._saveManyComponentConfigFiles(updatedComponentConfigFiles);
    await this.workspace._reloadConsumer();
    return this._installModules({ dedupe: true });
  }

  async addDuplicateComponentAndPackageIssue(components: Component[]) {
    const workspacePolicy = this.dependencyResolver.getWorkspacePolicy();
    components.forEach((component) => {
      if (component.state._consumer.removed) return;
      const pkgName = componentIdToPackageName(component.state._consumer);
      const found = workspacePolicy.find(pkgName);
      if (found) {
        component.state.issues.getOrCreate(IssuesClasses.DuplicateComponentAndPackage).data = found.dependencyId;
      }
    });
  }

  private async _getComponentsWithDependencyPolicies() {
    const allComponentIds = await this.workspace.listIds();
    const componentConfigFiles: Record<string, ComponentConfigFile> = {};
    const componentPoliciesById: Record<string, any> = {};
    (
      await Promise.all<ComponentConfigFile | undefined>(
        allComponentIds.map((componentId) => this.workspace.componentConfigFile(componentId))
      )
    ).forEach((componentConfigFile, index) => {
      if (!componentConfigFile) return;
      const depResolverConfig = componentConfigFile.aspects.get(DependencyResolverAspect.id);
      if (!depResolverConfig) return;
      const componentId = allComponentIds[index].toString();
      componentConfigFiles[componentId] = componentConfigFile;
      componentPoliciesById[componentId] = depResolverConfig.config.policy;
    });
    return {
      componentConfigFiles,
      componentPoliciesById,
    };
  }

  private _variantPatternsToDepPolicesDict(variantPatterns: Patterns): Record<string, VariantPolicyConfigObject> {
    const variantPoliciesByPatterns: Record<string, VariantPolicyConfigObject> = {};
    for (const [variantPattern, extensions] of Object.entries(variantPatterns)) {
      if (extensions[DependencyResolverAspect.id]?.policy) {
        variantPoliciesByPatterns[variantPattern] = extensions[DependencyResolverAspect.id]?.policy;
      }
    }
    return variantPoliciesByPatterns;
  }

  private _updateVariantsPolicies(variantPatterns: Record<string, any>, updateVariantPolicies: string[]) {
    for (const variantPattern of updateVariantPolicies) {
      this.variants.setExtension(
        variantPattern,
        DependencyResolverAspect.id,
        variantPatterns[variantPattern][DependencyResolverAspect.id],
        { overrideExisting: true }
      );
    }
    return this.dependencyResolver.persistConfig(this.workspace.path);
  }

  private async _saveManyComponentConfigFiles(componentConfigFiles: ComponentConfigFile[]) {
    await Promise.all(
      Array.from(componentConfigFiles).map(async (componentConfigFile) => {
        await componentConfigFile.write({ override: true });
      })
    );
  }

  /**
   * Uninstall the specified packages from dependencies.
   *
   * @param {string[]} the list of packages that should be removed from dependencies.
   */
  async uninstallDependencies(packages: string[]) {
    this.dependencyResolver.removeFromRootPolicy(packages);
    await this.dependencyResolver.persistConfig(this.workspace.path);
    return this._installModules({ dedupe: true });
  }

  /**
   * This function returns all the locations of the external links that should be created inside node_modules.
   * This information may then be passed to the package manager, which will create the links on its own.
   */
  async calculateLinks(
    options: WorkspaceLinkOptions = {}
  ): Promise<{ linkResults: WorkspaceLinkResults; linkedRootDeps: Record<string, string>; linker: DependencyLinker }> {
    await pMapSeries(this.preLinkSlot.values(), (fn) => fn(options)); // import objects if not disabled in options
    const compDirMap = await this.getComponentsDirectory([]);
    const linker = this.dependencyResolver.getLinker({
      rootDir: this.workspace.path,
      linkingOptions: options,
    });
    const { linkResults: res, linkedRootDeps } = await linker.calculateLinkedDeps(
      this.workspace.path,
      compDirMap,
      options
    );
    const workspaceRes = res as WorkspaceLinkResults;

    const legacyResults = await this.linkCodemods(compDirMap, options);
    workspaceRes.legacyLinkResults = legacyResults.linksResults;
    workspaceRes.legacyLinkCodemodResults = legacyResults.codemodResults;

    if (this.dependencyResolver.hasRootComponents() && options.linkToBitRoots) {
      await this._linkAllComponentsToBitRoots(compDirMap);
    }
    return { linkResults: res, linkedRootDeps, linker };
  }

  async linkCodemods(compDirMap: ComponentMap<string>, options?: { rewire?: boolean }) {
    const bitIds = compDirMap.toArray().map(([component]) => component.id._legacy);
    return linkToNodeModulesWithCodemod(this.workspace, bitIds, options?.rewire ?? false);
  }

  async link(options: WorkspaceLinkOptions = {}): Promise<WorkspaceLinkResults> {
    const { linkResults, linkedRootDeps, linker } = await this.calculateLinks(options);
    await linker.createLinks(this.workspace.path, linkedRootDeps);
    return linkResults;
  }

  private async _linkAllComponentsToBitRoots(compDirMap: ComponentMap<string>) {
    const envs = await this._getAllUsedEnvIds();
    const apps = (await this.app.listAppsFromComponents()).map((component) => component.id.toString());
    await Promise.all(
      [...envs, ...apps].map(async (id) => {
        await fs.mkdirp(getRootComponentDir(this.workspace.path, id.toString()));
      })
    );
    await linkPkgsToBitRoots(
      this.workspace.path,
      compDirMap.components.map((component) => this.dependencyResolver.getPackageName(component))
    );
  }

  /**
   * Generate a filter to pass to the installer
   * This will filter deps which are come from remotes which defined in scope.json
   * those components comes from local remotes, usually doesn't have a package in a registry
   * so no reason to try to install them (it will fail)
   */
  private async generateFilterFnForDepsFromLocalRemote() {
    // TODO: once scope create a new API for this, replace it with the new one
    const remotes = await this.workspace.scope._legacyRemotes();
    const reg = await this.dependencyResolver.getRegistries();
    const packageScopes = Object.keys(reg.scopes);
    return (dependencyList: DependencyList): DependencyList => {
      const filtered = dependencyList.filter((dep) => {
        if (!(dep instanceof ComponentDependency)) {
          return true;
        }
        if (remotes.isHub(dep.componentId.scope)) {
          return true;
        }
        if (packageScopes.some((scope) => dep.packageName.startsWith(`@${scope}/`))) {
          return true;
        }
        return false;
      });
      return filtered;
    };
  }

  private async getComponentsDirectory(ids: ComponentID[]): Promise<ComponentMap<string>> {
    const components = ids.length ? await this.workspace.getMany(ids) : await this.workspace.list();
    return ComponentMap.as<string>(components, (component) => this.workspace.componentDir(component.id));
  }

  private async onRootAspectAddedSubscriber(_aspectId: ComponentID, inWs: boolean): Promise<void> {
    if (!inWs) {
      await this.install();
    }
  }
  private async onAspectsResolveSubscriber(aspectComponents: Component[]): Promise<void> {
    let needLink = false;
    let needInstall = false;
    const promises = aspectComponents.map(async (aspectComponent) => {
      const aspectIdStr = aspectComponent.id.toString();
      if (this.visitedAspects.has(aspectIdStr)) return;

      this.visitedAspects.add(aspectIdStr);
      const packagePath = this.workspace.getComponentPackagePath(aspectComponent);
      const exists = await pathExists(packagePath);
      if (!exists) {
        const inWs = await this.workspace.hasId(aspectComponent.id);
        if (inWs) {
          needLink = true;
        } else {
          needInstall = true;
        }
      }
    });
    await Promise.all(promises);
    if (needInstall) {
      await this.install();
      return;
    }
    if (needLink) {
      await this.link();
    }
  }

  static slots = [Slot.withType<PreLinkSlot>(), Slot.withType<PreInstallSlot>()];
  static dependencies = [
    DependencyResolverAspect,
    WorkspaceAspect,
    LoggerAspect,
    VariantsAspect,
    CLIAspect,
    CompilerAspect,
    IssuesAspect,
    EnvsAspect,
    ApplicationAspect,
  ];

  static runtime = MainRuntime;

  static async provider(
    [dependencyResolver, workspace, loggerExt, variants, cli, compiler, issues, envs, app]: [
      DependencyResolverMain,
      Workspace,
      LoggerMain,
      VariantsMain,
      CLIMain,
      CompilerMain,
      IssuesMain,
      EnvsMain,
      ApplicationMain
    ],
    _,
    [preLinkSlot, preInstallSlot]: [PreLinkSlot, PreInstallSlot]
  ) {
    const logger = loggerExt.createLogger('teambit.bit/install');
    const installExt = new InstallMain(
      dependencyResolver,
      logger,
      workspace,
      variants,
      compiler,
      envs,
      app,
      preLinkSlot,
      preInstallSlot
    );
    if (issues) {
      issues.registerAddComponentsIssues(installExt.addDuplicateComponentAndPackageIssue.bind(installExt));
    }
    const commands: CommandList = [
      new InstallCmd(installExt, workspace, logger),
      new UninstallCmd(installExt),
      new UpdateCmd(installExt),
      new LinkCommand(installExt, workspace, logger),
    ];
    // For now do not automate installation during aspect resolving
    // workspace.registerOnAspectsResolve(installExt.onAspectsResolveSubscriber.bind(installExt));
    if (workspace) {
      workspace.registerOnRootAspectAdded(installExt.onRootAspectAddedSubscriber.bind(installExt));
    }
    cli.register(...commands);
    return installExt;
  }
}

type ComponentsAndManifests = {
  componentDirectoryMap: ComponentMap<string>;
  manifests: Record<string, ProjectManifest>;
};

function hasComponentsFromWorkspaceInMissingDeps({
  componentDirectoryMap,
  manifests,
}: ComponentsAndManifests): boolean {
  const missingDeps = new Set<string>(
    componentDirectoryMap
      .toArray()
      .map(([{ state }]) => {
        const issue = state.issues.getIssue(IssuesClasses.MissingPackagesDependenciesOnFs);
        if (!issue) return [];
        return Object.values(issue.data).flat();
      })
      .flat()
  );
  return Object.values(manifests).some(({ name }) => name && missingDeps.has(name));
}

InstallAspect.addRuntime(InstallMain);

export default InstallMain;

function manifestsHash(manifests: Record<string, ProjectManifest>): string {
  // We don't care if the type of the dependency changes as it doesn't change the node_modules structure
  const depsByProjectPaths = mapValues(manifests, (manifest) => ({
    ...manifest.devDependencies,
    ...manifest.dependencies,
  }));
  return hash(depsByProjectPaths);
}
