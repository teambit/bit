import pFilter from 'p-filter';
import fs, { pathExists } from 'fs-extra';
import path from 'path';
import { getRootComponentDir, linkPkgsToRootComponents } from '@teambit/workspace.root-components';
import { CompilerMain, CompilerAspect, CompilationInitiator } from '@teambit/compiler';
import { CLIMain, CommandList, CLIAspect, MainRuntime } from '@teambit/cli';
import chalk from 'chalk';
import yesno from 'yesno';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { compact, mapValues, omit, uniq, intersection, groupBy } from 'lodash';
import { ProjectManifest } from '@pnpm/types';
import { GenerateResult, GeneratorAspect, GeneratorMain } from '@teambit/generator';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { ApplicationMain, ApplicationAspect } from '@teambit/application';
import { VariantsMain, VariantsAspect } from '@teambit/variants';
import { Component, ComponentID, ComponentMap } from '@teambit/component';
import { PackageJsonFile } from '@teambit/component.sources';
import { createLinks } from '@teambit/dependencies.fs.linked-dependencies';
import pMapSeries from 'p-map-series';
import { Harmony, Slot, SlotRegistry } from '@teambit/harmony';
import { type DependenciesGraph } from '@teambit/objects';
import {
  CodemodResult,
  linkToNodeModulesWithCodemod,
  NodeModulesLinksResult,
} from '@teambit/workspace.modules.node-modules-linker';
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import { IpcEventsAspect, IpcEventsMain } from '@teambit/ipc-events';
import { IssuesClasses } from '@teambit/component-issues';
import {
  GetComponentManifestsOptions,
  WorkspaceDependencyLifecycleType,
  DependencyResolverMain,
  DependencyInstaller,
  DependencyResolverAspect,
  PackageManagerInstallOptions,
  ComponentDependency,
  WorkspacePolicyEntry,
  LinkingOptions,
  LinkResults,
  DependencyList,
  MergedOutdatedPkg,
  WorkspacePolicy,
  UpdatedComponent,
} from '@teambit/dependency-resolver';
import { WorkspaceConfigFilesAspect, WorkspaceConfigFilesMain } from '@teambit/workspace-config-files';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { IssuesAspect, IssuesMain } from '@teambit/issues';
import { snapToSemver } from '@teambit/component-package-version';
import { AspectDefinition, AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import hash from 'object-hash';
import { BundlerAspect, BundlerMain } from '@teambit/bundler';
import { UIAspect, UiMain } from '@teambit/ui';
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
  includePeers?: boolean;
};

export type WorkspaceLinkResults = {
  legacyLinkResults?: NodeModulesLinksResult[];
  legacyLinkCodemodResults?: CodemodResult[];
} & LinkResults;

export type WorkspaceInstallOptions = {
  addMissingDeps?: boolean;
  skipUnavailable?: boolean;
  addMissingPeers?: boolean;
  lifecycleType?: WorkspaceDependencyLifecycleType;
  dedupe?: boolean;
  import?: boolean;
  showExternalPackageManagerPrompt?: boolean;
  copyPeerToRuntimeOnRoot?: boolean;
  copyPeerToRuntimeOnComponents?: boolean;
  updateExisting?: boolean;
  skipIfExisting?: boolean;
  savePrefix?: string;
  compile?: boolean;
  includeOptionalDeps?: boolean;
  updateAll?: boolean;
  recurringInstall?: boolean;
  optimizeReportForNonTerminal?: boolean;
  lockfileOnly?: boolean;
  writeConfigFiles?: boolean;
  skipPrune?: boolean;
  dependenciesGraph?: DependenciesGraph;
};

export type ModulesInstallOptions = Omit<WorkspaceInstallOptions, 'updateExisting' | 'lifecycleType' | 'import'>;

type PreLink = (linkOpts?: WorkspaceLinkOptions) => Promise<void>;
type PreInstall = (installOpts?: WorkspaceInstallOptions) => Promise<void>;
type PostInstall = () => Promise<void>;

type PreLinkSlot = SlotRegistry<PreLink>;
type PreInstallSlot = SlotRegistry<PreInstall>;
type PostInstallSlot = SlotRegistry<PostInstall>;

type GetComponentsAndManifestsOptions = Omit<
  GetComponentManifestsOptions,
  'componentDirectoryMap' | 'rootPolicy' | 'rootDir'
> &
  Pick<PackageManagerInstallOptions, 'nodeLinker'>;

type ReloadAspectGroup = { comps: boolean; workspace: boolean; envOfAspect?: boolean; aspects: AspectDefinition[] };
export class InstallMain {
  private visitedAspects: Set<string> = new Set();

  private oldNonLoadedEnvs: string[] = [];

  constructor(
    private dependencyResolver: DependencyResolverMain,

    private logger: Logger,

    private workspace: Workspace,

    private variants: VariantsMain,

    private compiler: CompilerMain,

    private envs: EnvsMain,

    private wsConfigFiles: WorkspaceConfigFilesMain,

    private aspectLoader: AspectLoaderMain,

    private app: ApplicationMain,

    private generator: GeneratorMain,

    private preLinkSlot: PreLinkSlot,

    private preInstallSlot: PreInstallSlot,

    private postInstallSlot: PostInstallSlot,

    private ipcEvents: IpcEventsMain,

    private harmony: Harmony
  ) {}
  /**
   * Install dependencies for all components in the workspace
   *
   * @returns
   * @memberof Workspace
   */
  async install(packages?: string[], options?: WorkspaceInstallOptions): Promise<ComponentMap<string>> {
    // Check if external package manager mode is enabled
    const workspaceConfig = this.workspace.getWorkspaceConfig();
    const depResolverExtConfig = workspaceConfig.extensions.findExtension('teambit.dependencies/dependency-resolver');
    if (depResolverExtConfig?.config.externalPackageManager) {
      if (options?.showExternalPackageManagerPrompt) {
        // For explicit "bit install" commands, show the prompt
        await this.handleExternalPackageManagerPrompt();
      } else {
        await this.writeDependenciesToPackageJson();
        this.logger.console(
          chalk.yellow(
            'Installation was skipped due to external package manager configuration. Please run your package manager to install dependencies.'
          )
        );
        return new ComponentMap(new Map());
      }
    }

    // set workspace in install context
    this.workspace.inInstallContext = true;
    this.workspace.inInstallAfterPmContext = false;
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
        hoistPatterns: this.dependencyResolver.config.hoistPatterns,
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

    await this.ipcEvents.publishIpcEvent('onPostInstall');

    return res;
  }

  async writeDependenciesToPackageJson() {
    const installer = this.dependencyResolver.getInstaller({});
    const mergedRootPolicy = await this.addConfiguredAspectsToWorkspacePolicy();
    await this.addConfiguredGeneratorEnvsToWorkspacePolicy(mergedRootPolicy);
    const componentsAndManifests = await this._getComponentsManifests(installer, mergedRootPolicy, {});
    this.workspace.writeDependenciesToPackageJson(componentsAndManifests.manifests[this.workspace.path].dependencies);
  }

  registerPreLink(fn: PreLink) {
    this.preLinkSlot.register(fn);
  }

  registerPreInstall(fn: PreInstall) {
    this.preInstallSlot.register(fn);
  }

  registerPostInstall(fn: PostInstall) {
    this.postInstallSlot.register(fn);
  }

  async onComponentCreate(generateResults: GenerateResult[], installOptions?: Partial<WorkspaceInstallOptions>) {
    this.workspace.inInstallContext = true;
    let runInstall = false;
    let packages: string[] = [];
    let installMissing = false;

    const ids = generateResults.map((generateResult) => {
      if (generateResult.dependencies && generateResult.dependencies.length) {
        packages = packages.concat(generateResult.dependencies);
        runInstall = true;
      }
      if (generateResult.installMissingDependencies) {
        installMissing = true;
        runInstall = true;
      }
      if (generateResult.isApp || generateResult.isEnv) {
        runInstall = true;
      }
      return generateResult.id;
    });
    const nonLoadedEnvs: string[] = [];

    ids.map((id) => this.workspace.clearComponentCache(id));
    await pMapSeries(ids, async (id) => {
      const component = await this.workspace.get(id);
      // const envId = await this.envs.getEnvId(component);
      const envId = (await this.envs.calculateEnvId(component)).toString();
      const isLoaded = this.envs.isEnvRegistered(envId);
      if (!isLoaded) {
        nonLoadedEnvs.push(envId);
      }
      return component;
    });
    if (nonLoadedEnvs.length) {
      runInstall = true;
    }
    if (!runInstall) {
      this.workspace.inInstallContext = false;
      return;
    }
    // this.logger.console(
    // `the following environments are not installed yet: ${nonLoadedEnvs.join(', ')}. installing them now...`
    // );
    await this.install(packages, {
      ...installOptions,
      addMissingDeps: installMissing,
      skipIfExisting: true,
      writeConfigFiles: false,
      // skipPrune: true,
    });
  }

  private async _addPackages(packages: string[], options?: WorkspaceInstallOptions) {
    if ((options?.lifecycleType as string) === 'dev') {
      throw new DependencyTypeNotSupportedInPolicy(options?.lifecycleType as string);
    }
    this.logger.debug(`installing the following packages: ${packages.join()}`);
    const resolver = await this.dependencyResolver.getVersionResolver();
    const resolvedPackagesP = packages.map(async (packageName) => {
      try {
        return await resolver.resolveRemoteVersion(packageName, {
          rootDir: this.workspace.path,
        });
      } catch (error: unknown) {
        if (options?.skipUnavailable) {
          return;
        }
        throw error;
      }
    });
    const resolvedPackages = await Promise.all(resolvedPackagesP);
    const newWorkspacePolicyEntries: WorkspacePolicyEntry[] = [];
    resolvedPackages.forEach((resolvedPackage) => {
      if (resolvedPackage?.version) {
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
    this.dependencyResolver.addToRootPolicy(newWorkspacePolicyEntries, {
      updateExisting: options?.updateExisting ?? false,
      skipIfExisting: options?.skipIfExisting ?? false,
    });
    await this.dependencyResolver.persistConfig('install');
  }

  private async _installModules(options?: ModulesInstallOptions): Promise<ComponentMap<string>> {
    const pm = this.dependencyResolver.getPackageManager();
    this.logger.console(
      `installing dependencies in workspace using ${pm?.name} (${chalk.cyan(
        this.dependencyResolver.packageManagerName
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
    const linkOpts = {
      linkTeambitBit: true,
      linkCoreAspects: this.dependencyResolver.linkCoreAspects(),
      linkDepsResolvedFromEnv: !hasRootComponents,
      linkNestedDepsInNM: !this.workspace.isLegacy && !hasRootComponents,
    };
    const { linkedRootDeps } = await this.calculateLinks(linkOpts);
    // eslint-disable-next-line prefer-const
    let { mergedRootPolicy, componentsAndManifests: current } = await this._getComponentsManifestsAndRootPolicy(
      installer,
      {
        ...calcManifestsOpts,
        addMissingDeps: options?.addMissingDeps,
        skipUnavailable: options?.skipUnavailable,
        linkedRootDeps,
      }
    );

    const pmInstallOptions: PackageManagerInstallOptions = {
      ...calcManifestsOpts,
      autoInstallPeers: this.dependencyResolver.config.autoInstallPeers,
      dependenciesGraph: options?.dependenciesGraph,
      includeOptionalDeps: options?.includeOptionalDeps,
      neverBuiltDependencies: this.dependencyResolver.config.neverBuiltDependencies,
      overrides: this.dependencyResolver.config.overrides,
      hoistPatterns: this.dependencyResolver.config.hoistPatterns,
      hoistInjectedDependencies: this.dependencyResolver.config.hoistInjectedDependencies,
      packageImportMethod: this.dependencyResolver.config.packageImportMethod,
      rootComponents: hasRootComponents,
      updateAll: options?.updateAll,
      optimizeReportForNonTerminal: options?.optimizeReportForNonTerminal,
      lockfileOnly: options?.lockfileOnly,
    };
    const prevManifests = new Set<string>();
    // TODO: this make duplicate
    // this.logger.consoleSuccess();
    const linkedDependencies = {
      [this.workspace.path]: linkedRootDeps,
    };
    const compDirMap = await this.getComponentsDirectory([]);
    let installCycle = 0;
    let hasMissingLocalComponents = true;
    const forcedHarmonyVersion = this.dependencyResolver.harmonyVersionInRootPolicy();
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
          forcedHarmonyVersion,
        },
        pmInstallOptions
      );
      this.workspace.inInstallAfterPmContext = true;
      let cacheCleared = false;
      await this.linkCodemods(compDirMap);
      const oldNonLoadedEnvs = this.setOldNonLoadedEnvs();
      await this.reloadMovedEnvs();
      await this.reloadNonLoadedEnvs();

      const shouldClearCacheOnInstall = this.shouldClearCacheOnInstall();
      if (options?.compile ?? true) {
        const compileStartTime = process.hrtime();
        const compileOutputMessage = `compiling components`;
        this.logger.setStatusLine(compileOutputMessage);
        if (shouldClearCacheOnInstall) {
          // We need to clear cache before compiling the components or it might compile them with the default env
          // incorrectly in case the env was not loaded correctly before the installation.
          // We don't want to clear the failed to load envs because we want to show the warning at the end
          // await this.workspace.clearCache({ skipClearFailedToLoadEnvs: true });
          await this.workspace.clearCache();
          cacheCleared = true;
        }
        await this.compiler.compileOnWorkspace([], { initiator: CompilationInitiator.Install });

        // Right now we don't need to load extensions/execute load slot at this point
        // await this.compiler.compileOnWorkspace([], { initiator: CompilationInitiator.Install }, undefined, {
        //   executeLoadSlot: true,
        //   loadExtensions: true,
        // });
        this.logger.consoleSuccess(compileOutputMessage, compileStartTime);
      }
      if (options?.writeConfigFiles ?? true) {
        await this.tryWriteConfigFiles(!cacheCleared && shouldClearCacheOnInstall);
      }
      if (!dependenciesChanged) break;
      if (!options?.recurringInstall) break;

      if (!oldNonLoadedEnvs.length) break;
      prevManifests.add(manifestsHash(current.manifests));
      // If we run compile we do the clear cache before the compilation so no need to clean it again (it's an expensive
      // operation)
      if (!cacheCleared && shouldClearCacheOnInstall) {
        // We need to clear cache before creating the new component manifests.
        // this.workspace.consumer.componentLoader.clearComponentsCache();
        // We don't want to clear the failed to load envs because we want to show the warning at the end
        await this.workspace.clearCache({ skipClearFailedToLoadEnvs: true });
      }
      current = await this._getComponentsManifests(installer, mergedRootPolicy, calcManifestsOpts);
      installCycle += 1;
    } while ((!prevManifests.has(manifestsHash(current.manifests)) || hasMissingLocalComponents) && installCycle < 5);
    if (!options?.lockfileOnly && !options?.skipPrune) {
      // We clean node_modules only after the last install.
      // Otherwise, we might load an env from a location that we later remove.
      try {
        await installer.pruneModules(this.workspace.path);
        // Ignoring the error here as it's not critical and we don't want to fail the install process
      } catch (err: any) {
        this.logger.error(`failed running pnpm prune with error`, err);
      }
      // After pruning we need reload moved envs, as during the pruning the old location might be deleted
      await this.reloadMovedEnvs();
    }
    // this is now commented out because we assume we don't need it anymore.
    // even when the env was not loaded before and it is loaded now, it should be fine because the dependencies-data
    // is only about the auto-detect-deps. there are two more steps: version-resolution and apply-overrides that
    // disregard the dependencies-cache.
    // await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
    /* eslint-enable no-await-in-loop */
    return current.componentDirectoryMap;
  }

  private shouldClearCacheOnInstall(): boolean {
    const nonLoadedEnvs = this.envs.getFailedToLoadEnvs();
    return nonLoadedEnvs.length > 0;
  }

  /**
   * This function is very important to fix some issues that might happen during the installation process.
   * The case is the following:
   * during/before the installation process we load some envs from their bit.env files
   * this contains code like:
   * protected tsconfigPath = require.resolve('./config/tsconfig.json');
   * protected eslintConfigPath = require.resolve('./config/eslintrc.cjs');
   * When we load that file, we calculated the resolved path, and it's stored in the env
   * object instance.
   * then later on during the install we move the env to another location (like bit roots)
   * which points to a .pnpm folder with some peers, that changed during the install
   * then when we take this env object and call write ws config for example
   * or compile
   * we use that resolved path to calculate the final tsconfig
   * however that file is no longer exists which result in an error
   * This function will check if an env folder doesn't exist anymore, and will re-load it
   * from its new location.
   * This usually happen when we have install running in the middle of the process followed
   * by other bit ops.
   * examples:
   * bit new - which might run few installs then other ops.
   * bit switch - which might run few installs then other ops, and potentially change the
   * peer deps during the install.
   * bit server (vscode plugin) - which keep the process always live, so any install ops
   * that change the location, will cause the vscode plugin/bit server to crash later.
   * @returns
   */
  private async reloadMovedEnvs() {
    this.logger.debug('reloadMovedEnvs');
    const allEnvs = this.envs.getAllRegisteredEnvs();
    const movedEnvs = await pFilter(allEnvs, async (env) => {
      if (!env.__path) return false;
      const regularPathExists = await pathExists(env.__path);
      const resolvedPathExists = await pathExists(env.__resolvedPath);
      return !regularPathExists || !resolvedPathExists;
    });
    const idsToLoad = movedEnvs.map((env) => env.id);
    const componentIdsToLoad = idsToLoad.map((id) => ComponentID.fromString(id));
    await this.reloadEnvs(componentIdsToLoad);
  }

  private async reloadRegisteredEnvs() {
    const allEnvs = this.envs.getAllRegisteredEnvs();
    const idsToLoad = compact(allEnvs.map((env) => env.id));
    const componentIdsToLoad = idsToLoad.map((id) => ComponentID.fromString(id));
    await this.reloadEnvs(componentIdsToLoad);
  }

  private async reloadNonLoadedEnvs() {
    const nonLoadedEnvs = this.envs.getFailedToLoadEnvs();
    const componentIdsToLoad = nonLoadedEnvs.map((id) => ComponentID.fromString(id));
    await this.reloadEnvs(componentIdsToLoad);
  }

  private async reloadEnvs(componentIdsToLoad: ComponentID[]) {
    if (componentIdsToLoad.length && this.workspace) {
      const aspects = await this.workspace.resolveAspects(undefined, componentIdsToLoad, {
        requestedOnly: true,
        excludeCore: true,
        throwOnError: false,
        // Theoretically we should use skipDeps here, but according to implementation at the moment
        // it will lead to plugins not load, and we need them to be loaded.
        // This is a bug in the flow and should be fixed.
        // skipDeps: true,
      });

      await Promise.all(
        aspects.map(async (aspectDef) => {
          const id = aspectDef.component?.id;
          if (!id) return;
          await this.workspace.clearComponentCache(id);
        })
      );
      await this.reloadAspects(aspects || []);

      // Keeping this here for now, it was removed as part of #9138 as now that we load envs of envs
      // correctly first it seems to be not needed anymore.
      // But there might be cases where it will be needed. So keeping it here for now.

      // This is a very special case which we need to compile our envs before loading them correctly.
      //   const grouped = groupBy(aspects, (aspectDef) => {
      //     return aspectDef.component?.id.toStringWithoutVersion() === 'bitdev.general/envs/bit-env';
      //   });
      //   await this.reloadAspects(grouped.true || []);
      //   const otherEnvs = grouped.false || [];
      //   await Promise.all(
      //     otherEnvs.map(async (aspectDef) => {
      //       const id = aspectDef.component?.id;
      //       if (!id) return;
      //       await this.workspace.clearComponentCache(id);
      //     })
      //   );
      //   await this.reloadAspects(grouped.false || []);
    }
  }

  private async reloadAspects(aspects: AspectDefinition[]) {
    const groups = await this.groupAspectsToLoad(aspects);
    // We need to make sure we load group by group and not in parallel
    await pMapSeries(groups, async (group) => {
      await this.reloadOneAspectsGroup(group);
    });
  }

  private async reloadOneAspectsGroup(group: ReloadAspectGroup) {
    const aspects = group.aspects || [];
    if (group.workspace && !group.envOfAspect) {
      aspects.forEach((aspectDef) => {
        if (aspectDef.component?.id) {
          this.workspace.clearComponentCache(aspectDef.component.id);
        }
      });
    }
    const loadedPlugins = compact(
      await Promise.all(
        aspects.map((aspectDef) => {
          const localPath = aspectDef.aspectPath;
          const component = aspectDef.component;
          if (!component) return undefined;
          const plugins = this.aspectLoader.getPlugins(component, localPath);
          if (plugins.has()) {
            return plugins.load(MainRuntime.name);
          }
        })
      )
    );
    await Promise.all(
      loadedPlugins.map((plugin) => {
        const runtime = plugin.getRuntime(MainRuntime);
        return runtime?.provider(undefined, undefined, undefined, this.harmony);
      })
    );
  }

  /**
   * This function groups the components to aspects to load into groups.
   * The order of the groups is important, the first group should be loaded first.
   * The order inside the group is not important.
   * The groups are:
   * 1. aspects definitions without components (this should be an empty group, if it's not, we should check why).
   * 2. aspects which are not in the workspace but in the scope / node modules.
   * 3. envs of aspects (which are also aspects)
   * 4. other aspects (the rest)
   * @param aspects
   * @returns
   */
  private async groupAspectsToLoad(aspects: AspectDefinition[]): Promise<Array<ReloadAspectGroup>> {
    const groups = groupBy(aspects, (aspectDef) => {
      if (!aspectDef.component) return 'no-comp';
      if (!this.workspace.hasId(aspectDef.component.id)) return 'scope';
      return 'workspace';
    });
    const workspaceSubGroups = await this.regroupEnvsIdsFromTheList(groups.workspace || []);
    return [
      { comps: false, workspace: false, aspects: groups.noComp || [] },
      { comps: true, workspace: false, aspects: groups.scope || [] },
      { comps: true, workspace: true, envOfAspect: true, aspects: workspaceSubGroups.envOfAspect },
      { comps: true, workspace: true, aspects: workspaceSubGroups.otherAspects },
    ];
  }

  private async regroupEnvsIdsFromTheList(aspects: AspectDefinition[]): Promise<Record<string, AspectDefinition[]>> {
    const envsOfAspects = new Set<string>();
    await Promise.all(
      aspects.map(async (aspectDef) => {
        if (!aspectDef.component) return;
        const envId = aspectDef.component ? await this.envs.calculateEnvId(aspectDef.component) : undefined;
        if (envId) {
          envsOfAspects.add(envId.toString());
        }
      })
    );
    const groups = groupBy(aspects, (aspectDef) => {
      const id = aspectDef.component?.id.toString();
      const idWithoutVersion = aspectDef.component?.id.toStringWithoutVersion();
      if ((id && envsOfAspects.has(id)) || (idWithoutVersion && envsOfAspects.has(idWithoutVersion))) {
        return 'envOfAspect';
      }
      return 'otherAspects';
    });

    return groups;
  }

  private async _getComponentsManifestsAndRootPolicy(
    installer: DependencyInstaller,
    options: GetComponentsAndManifestsOptions & {
      addMissingDeps?: boolean;
      skipUnavailable?: boolean;
      linkedRootDeps: Record<string, string>;
    }
  ): Promise<{ componentsAndManifests: ComponentsAndManifests; mergedRootPolicy: WorkspacePolicy }> {
    const mergedRootPolicy = await this.addConfiguredAspectsToWorkspacePolicy();
    await this.addConfiguredGeneratorEnvsToWorkspacePolicy(mergedRootPolicy);
    const componentsAndManifests = await this._getComponentsManifests(installer, mergedRootPolicy, options);
    if (!options?.addMissingDeps) {
      return { componentsAndManifests, mergedRootPolicy };
    }
    const rootDeps = new Set(
      Object.keys({
        ...componentsAndManifests.manifests[this.workspace.path].devDependencies,
        ...componentsAndManifests.manifests[this.workspace.path].dependencies,
        ...options.linkedRootDeps,
      })
    );
    Object.values(omit(componentsAndManifests.manifests, [this.workspace.path])).forEach((manifest) => {
      if ((manifest as ProjectManifest).name) {
        rootDeps.add((manifest as ProjectManifest).name!); // eslint-disable-line @typescript-eslint/no-non-null-assertion
      }
    });
    const addedNewPkgs = await this._addMissingPackagesToRootPolicy(rootDeps, {
      skipUnavailable: options?.skipUnavailable,
    });
    if (!addedNewPkgs) {
      return { componentsAndManifests, mergedRootPolicy };
    }
    const mergedRootPolicyWithMissingDeps = await this.addConfiguredAspectsToWorkspacePolicy();
    await this.addConfiguredGeneratorEnvsToWorkspacePolicy(mergedRootPolicyWithMissingDeps);
    return {
      mergedRootPolicy: mergedRootPolicyWithMissingDeps,
      componentsAndManifests: await this._getComponentsManifests(installer, mergedRootPolicyWithMissingDeps, options),
    };
  }

  /**
   * The function `tryWriteConfigFiles` attempts to write workspace config files, and if it fails, it logs an error
   * message.
   * @returns If the condition `!shouldWrite` is true, then nothing is being returned. Otherwise, if the `writeConfigFiles`
   * function is successfully executed, nothing is being returned. If an error occurs during the execution of
   * `writeConfigFiles`, an error message is being returned.
   */
  private async tryWriteConfigFiles(clearCache: boolean) {
    const shouldWrite = this.wsConfigFiles.isWorkspaceConfigWriteEnabled();
    if (!shouldWrite) return;
    if (clearCache) {
      await this.workspace.clearCache({ skipClearFailedToLoadEnvs: true });
    }
    const { err } = await this.wsConfigFiles.writeConfigFiles({
      clean: true,
      silent: true,
      dedupe: true,
      throw: false,
    });

    if (err) {
      this.logger.consoleFailure(
        `failed generating workspace config files, please run "bit ws-config write" manually. error: ${err.message}`
      );
    }
  }

  private async addConfiguredAspectsToWorkspacePolicy(): Promise<WorkspacePolicy> {
    const rootPolicy = this.dependencyResolver.getWorkspacePolicy();
    const aspectsPackages = await this.workspace.getConfiguredUserAspectsPackages({ externalsOnly: true });
    aspectsPackages.forEach((aspectsPackage) => {
      rootPolicy.add(
        {
          dependencyId: aspectsPackage.packageName,
          value: {
            version: aspectsPackage.version,
          },
          lifecycleType: 'runtime',
        },
        // If it's already exist from the root, take the version from the root policy
        { skipIfExisting: true }
      );
    });
    return rootPolicy;
  }

  private async addConfiguredGeneratorEnvsToWorkspacePolicy(rootPolicy: WorkspacePolicy): Promise<void> {
    const configuredEnvs = this.generator.getConfiguredEnvs();
    const resolvedEnvs = compact(
      await Promise.all(
        configuredEnvs.map(async (envIdStr) => {
          if (this.envs.isCoreEnv(envIdStr)) {
            return undefined;
          }
          const parsedId = await this.workspace.resolveComponentId(envIdStr);
          // If we have the env in the workspace, we don't want to install it
          const inWs = await this.workspace.hasId(parsedId);
          if (inWs) {
            return undefined;
          }
          const comps = await this.workspace.importAndGetMany(
            [parsedId],
            `to get the env ${parsedId.toString()} for installation`
          );
          const idWithVersion = await this.workspace.resolveEnvIdWithPotentialVersionForConfig(parsedId);
          const version = idWithVersion.split('@')[1] || '*';
          const packageName = this.dependencyResolver.getPackageName(comps[0]);
          return {
            packageName,
            version,
          };
        })
      )
    );

    resolvedEnvs.forEach((env) => {
      rootPolicy.add(
        {
          dependencyId: env.packageName,
          value: {
            version: env.version,
          },
          lifecycleType: 'runtime',
        },
        // If it's already exist from the root, take the version from the root policy
        { skipIfExisting: true }
      );
    });
  }

  private async _addMissingPackagesToRootPolicy(
    rootDeps: Set<string>,
    options?: WorkspaceInstallOptions
  ): Promise<boolean> {
    const packages = await this._getMissingPackagesWithoutRootDeps(rootDeps);
    if (packages && packages.length) {
      await this._addPackages(packages, options);
    }
    return packages.length > 0;
  }

  private async _getMissingPackagesWithoutRootDeps(rootDeps: Set<string>) {
    const packages = await this._getAllMissingPackages();
    return packages.filter((pkg) => !rootDeps.has(pkg));
  }

  private async _getAllMissingPackages(): Promise<string[]> {
    const comps = await this.workspace.list();
    return uniq(
      comps
        .map((comp) => {
          const data = comp.state.issues.getIssue(IssuesClasses.MissingPackagesDependenciesOnFs)?.data || [];
          return data.map((d) => d.missingPackages).flat();
        })
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

  public setOldNonLoadedEnvs() {
    const nonLoadedEnvs = this.envs.getFailedToLoadEnvs();
    const envsWithoutManifest = Array.from(this.dependencyResolver.envsWithoutManifest);
    const oldNonLoadedEnvs = intersection(nonLoadedEnvs, envsWithoutManifest);
    this.oldNonLoadedEnvs = oldNonLoadedEnvs;
    return oldNonLoadedEnvs;
  }

  /**
   * This function returns a list of old non-loaded environments names.
   * @returns an array of strings called `oldNonLoadedEnvs`. This array contains the names of environment variables that
   * failed to load as extensions and are also don't have an env.jsonc file.
   * If this list is not empty, then the user might need to run another install to make sure all dependencies resolved
   * correctly
   */
  public getOldNonLoadedEnvs() {
    return this.oldNonLoadedEnvs;
  }

  private async _updateRootDirs(rootDirs: string[]) {
    try {
      const existingDirs = await fs.readdir(this.workspace.rootComponentsPath);
      await Promise.all(
        existingDirs.map(async (dirName) => {
          const dirPath = path.join(this.workspace.rootComponentsPath, dirName);
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
            await this.getRootComponentDirByRootId(this.workspace.rootComponentsPath, envId),
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
    const finalVersion = snapToSemver(version as string);
    return { [packageName]: finalVersion };
  }

  private async _getAppManifests(
    manifests: Record<string, ProjectManifest>,
    workspaceDeps: Record<string, string>,
    workspaceDepsMeta: Record<string, { injected: true }>
  ): Promise<Record<string, ProjectManifest>> {
    return Object.fromEntries(
      compact(
        await Promise.all(
          (await this.app.listAppsComponents()).map(async (app) => {
            const appPkgName = this.dependencyResolver.getPackageName(app);
            const appManifest = Object.values(manifests).find(({ name }) => name === appPkgName);
            if (!appManifest) return null;
            const envId = await this.envs.calculateEnvId(app);
            return [
              await this.getRootComponentDirByRootId(this.workspace.rootComponentsPath, app.id),
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
    const envs = new Map<string, ComponentID>();
    const components = await this.workspace.list();
    await pMapSeries(components, async (component) => {
      const envId = await this.envs.calculateEnvId(component);
      envs.set(envId.toString(), envId);
    });
    return Array.from(envs.values());
  }

  /**
   * Updates out-of-date dependencies in the workspace.
   *
   * @param options.all {Boolean} updates all outdated dependencies without showing a prompt.
   */
  async updateDependencies(options: {
    forceVersionBump?: 'major' | 'minor' | 'patch' | 'compatible';
    patterns?: string[];
    all: boolean;
  }): Promise<ComponentMap<string> | null> {
    const componentPolicies = await this.workspace.getComponentsWithDependencyPolicies();
    const variantPoliciesByPatterns = this.workspace.variantPatternsToDepPolicesDict();
    const components = await this.workspace.list();
    const outdatedPkgs = await this.dependencyResolver.getOutdatedPkgsFromPolicies({
      rootDir: this.workspace.path,
      variantPoliciesByPatterns,
      componentPolicies,
      components,
      patterns: options.patterns,
      forceVersionBump: options.forceVersionBump,
    });
    if (outdatedPkgs == null) {
      this.logger.consoleFailure('No dependencies found that match the patterns');
      return null;
    }
    let outdatedPkgsToUpdate!: MergedOutdatedPkg[];
    if (options.all) {
      outdatedPkgsToUpdate = outdatedPkgs;
    } else {
      this.logger.off();
      outdatedPkgsToUpdate = await pickOutdatedPkgs(outdatedPkgs);
      this.logger.on();
    }
    if (outdatedPkgsToUpdate.length === 0) {
      this.logger.consoleSuccess('No outdated dependencies found');
      if (options.forceVersionBump === 'compatible') {
        this.logger.console(
          "If you want to find new versions that don't match the current version ranges, retry with the --latest flag"
        );
      }
      return null;
    }
    const { updatedVariants, updatedComponents } = this.dependencyResolver.applyUpdates(outdatedPkgsToUpdate, {
      variantPoliciesByPatterns,
    });
    await this._updateVariantsPolicies(updatedVariants);
    await this._updateComponentsConfig(updatedComponents);
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

  private async _updateComponentsConfig(updatedComponents: UpdatedComponent[]) {
    if (updatedComponents.length === 0) return;
    await Promise.all(
      updatedComponents.map(({ componentId, config }) => {
        return this.workspace.addSpecificComponentConfig(componentId, DependencyResolverAspect.id, config, {
          shouldMergeWithExisting: true,
          shouldMergeWithPrevious: true,
        });
      })
    );
    await this.workspace.bitMap.write('update (dependencies)');
  }

  private async _updateVariantsPolicies(updateVariantPolicies: string[]) {
    const variantPatterns = this.variants.raw();
    for (const variantPattern of updateVariantPolicies) {
      this.variants.setExtension(
        variantPattern,
        DependencyResolverAspect.id,
        variantPatterns[variantPattern][DependencyResolverAspect.id],
        { overrideExisting: true }
      );
    }
    await this.dependencyResolver.persistConfig('update dependencies');
  }

  /**
   * Uninstall the specified packages from dependencies.
   *
   * @param {string[]} the list of packages that should be removed from dependencies.
   */
  async uninstallDependencies(packages: string[]) {
    this.dependencyResolver.removeFromRootPolicy(packages);
    await this.dependencyResolver.persistConfig('uninstall dependencies');
    return this._installModules({ dedupe: true });
  }

  /**
   * This function returns all the locations of the external links that should be created inside node_modules.
   * This information may then be passed to the package manager, which will create the links on its own.
   */
  async calculateLinks(
    options: WorkspaceLinkOptions = {}
  ): Promise<{ linkResults: WorkspaceLinkResults; linkedRootDeps: Record<string, string> }> {
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
    return { linkResults: res, linkedRootDeps };
  }

  async linkCodemods(compDirMap: ComponentMap<string>, options?: { rewire?: boolean }) {
    const bitIds = compDirMap.toArray().map(([component]) => component.id);
    return linkToNodeModulesWithCodemod(this.workspace, bitIds, options?.rewire ?? false);
  }

  async link(options: WorkspaceLinkOptions = {}): Promise<WorkspaceLinkResults> {
    const { linkResults, linkedRootDeps } = await this.calculateLinks(options);
    await createLinks(options.linkToDir ?? this.workspace.path, linkedRootDeps, {
      avoidHardLink: true,
      skipIfSymlinkValid: true,
    });
    return linkResults;
  }

  private async _linkAllComponentsToBitRoots(compDirMap: ComponentMap<string>) {
    const envs = await this._getAllUsedEnvIds();
    const apps = (await this.app.listAppsComponents()).map((component) => component.id);
    await Promise.all(
      [...envs, ...apps].map(async (id) => {
        const dir = await this.getRootComponentDirByRootId(this.workspace.rootComponentsPath, id);
        await fs.mkdirp(dir);
      })
    );
    await linkPkgsToRootComponents(
      {
        rootComponentsPath: this.workspace.rootComponentsPath,
        workspacePath: this.workspace.path,
      },
      compDirMap.components.map((component) => this.dependencyResolver.getPackageName(component))
    );
  }

  private async getRootComponentDirByRootId(rootComponentsPath: string, rootComponentId: ComponentID): Promise<string> {
    // Root directories for local envs and apps are created without their version number.
    // This is done in order to avoid changes to the lockfile after such components are tagged.
    const id = this.workspace.hasId(rootComponentId)
      ? rootComponentId.toStringWithoutVersion()
      : rootComponentId.toString();
    return getRootComponentDir(rootComponentsPath, id);
  }

  /**
   * Generate a filter to pass to the installer
   * This will filter deps which are come from remotes which defined in scope.json
   * those components comes from local remotes, usually doesn't have a package in a registry
   * so no reason to try to install them (it will fail)
   */
  private async generateFilterFnForDepsFromLocalRemote() {
    const remotes = await this.workspace.scope.getRemoteScopes();
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
    const components = ids.length
      ? await this.workspace.getMany(ids)
      : await this.workspace.list(undefined, { loadSeedersAsAspects: false });
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
      const packagePath = await this.workspace.getComponentPackagePath(aspectComponent);
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

  async onComponentChange(component: Component) {
    const isEnv = this.envs.isEnv(component);
    if (isEnv) {
      await this.reloadEnvs([component.id]);
    }
  }

  static slots = [Slot.withType<PreLinkSlot>(), Slot.withType<PreInstallSlot>(), Slot.withType<PostInstallSlot>()];
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
    IpcEventsAspect,
    GeneratorAspect,
    WorkspaceConfigFilesAspect,
    AspectLoaderAspect,
    BundlerAspect,
    UIAspect,
  ];

  static runtime = MainRuntime;

  static async provider(
    [
      dependencyResolver,
      workspace,
      loggerExt,
      variants,
      cli,
      compiler,
      issues,
      envs,
      app,
      ipcEvents,
      generator,
      wsConfigFiles,
      aspectLoader,
      bundler,
      ui,
    ]: [
      DependencyResolverMain,
      Workspace,
      LoggerMain,
      VariantsMain,
      CLIMain,
      CompilerMain,
      IssuesMain,
      EnvsMain,
      ApplicationMain,
      IpcEventsMain,
      GeneratorMain,
      WorkspaceConfigFilesMain,
      AspectLoaderMain,
      BundlerMain,
      UiMain,
    ],
    _,
    [preLinkSlot, preInstallSlot, postInstallSlot]: [PreLinkSlot, PreInstallSlot, PostInstallSlot],
    harmony: Harmony
  ) {
    const logger = loggerExt.createLogger(InstallAspect.id);
    const installExt = new InstallMain(
      dependencyResolver,
      logger,
      workspace,
      variants,
      compiler,
      envs,
      wsConfigFiles,
      aspectLoader,
      app,
      generator,
      preLinkSlot,
      preInstallSlot,
      postInstallSlot,
      ipcEvents,
      harmony
    );
    ipcEvents.registerGotEventSlot(async (eventName) => {
      if (eventName !== 'onPostInstall') return;
      logger.debug('got onPostInstall event, clear workspace and all components cache');
      await workspace.clearCache();
      await installExt.reloadMovedEnvs();
      await pMapSeries(postInstallSlot.values(), (fn) => fn());
    });
    if (issues) {
      issues.registerAddComponentsIssues(installExt.addDuplicateComponentAndPackageIssue.bind(installExt));
    }
    generator.registerOnComponentCreate(installExt.onComponentCreate.bind(installExt));
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
      workspace.registerOnComponentChange(installExt.onComponentChange.bind(installExt));
    }

    installExt.registerPostInstall(async () => {
      if (!ui.getUIServer()) {
        return;
      }
      const components = await workspace.list();
      await bundler.addNewDevServers(components);
    });
    cli.register(...commands);
    return installExt;
  }

  private async handleExternalPackageManagerPrompt(): Promise<void> {
    this.logger.clearStatusLine();

    // Display a colorful and informative message
    this.logger.console(chalk.cyan('\n📦 External Package Manager Mode Detected'));
    this.logger.console(chalk.gray('Your workspace is configured to use external package managers (npm, yarn, pnpm).'));
    this.logger.console(chalk.gray('Running "bit install" is not available in this mode.\n'));

    const question = chalk.bold(
      "Would you like to switch to Bit's package manager for dependency management? [yes(y)/no(n)]"
    );
    const shouldSwitchToBitPM = await yesno({ question });

    if (!shouldSwitchToBitPM) {
      throw new Error(
        'External package manager mode is enabled. Please use your preferred package manager (npm, yarn, pnpm) to install dependencies instead of "bit install".'
      );
    }

    // User chose to switch to Bit's package manager
    await this.disableExternalPackageManagerMode();
  }

  private async disableExternalPackageManagerMode(): Promise<void> {
    try {
      // Get the workspace config
      const workspaceConfig = this.workspace.getWorkspaceConfig();

      // Remove externalPackageManager property and restore default settings
      const depResolverExt = workspaceConfig.extensions.findExtension('teambit.dependencies/dependency-resolver');
      if (depResolverExt?.config.externalPackageManager) {
        delete depResolverExt.config.externalPackageManager;
      }
      if (depResolverExt) {
        depResolverExt.config.rootComponent = true;
      }

      // Enable workspace config write
      const workspaceConfigFilesExt = workspaceConfig.extensions.findExtension(
        'teambit.workspace/workspace-config-files'
      );
      if (workspaceConfigFilesExt) {
        workspaceConfigFilesExt.config.enableWorkspaceConfigWrite = true;
      }

      // Remove postInstall script from package.json (preserve user's existing scripts)
      await this.removePostInstallScript();

      // Write the updated config
      await workspaceConfig.write();

      this.logger.console(chalk.green('✓ Successfully switched to Bit package manager mode'));
    } catch (error) {
      this.logger.console(chalk.red('✗ Failed to switch to Bit package manager mode'));
      throw error;
    }
  }

  private async removePostInstallScript(): Promise<void> {
    try {
      const packageJsonFile = await PackageJsonFile.load(this.workspace.path);

      if (!packageJsonFile.fileExist) {
        return;
      }

      // Only remove our specific postInstall script, preserve user's custom scripts
      if (packageJsonFile.packageJsonObject.scripts?.postinstall === 'bit link && bit compile') {
        delete packageJsonFile.packageJsonObject.scripts.postinstall;

        // Clean up empty scripts object
        if (Object.keys(packageJsonFile.packageJsonObject.scripts).length === 0) {
          delete packageJsonFile.packageJsonObject.scripts;
        }

        await packageJsonFile.write();
      }
    } catch {
      this.logger.console(chalk.yellow('⚠ Warning: Could not remove postInstall script from package.json'));
    }
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
        return issue.data.map((d) => d.missingPackages).flat();
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
