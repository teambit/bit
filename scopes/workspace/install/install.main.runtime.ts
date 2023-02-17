import { CommunityMain, CommunityAspect } from '@teambit/community';
import { CompilerMain, CompilerAspect, CompilationInitiator } from '@teambit/compiler';
import { CLIMain, CommandList, CLIAspect, MainRuntime } from '@teambit/cli';
import chalk from 'chalk';
import { WorkspaceAspect, Workspace, ComponentConfigFile } from '@teambit/workspace';
import { pick } from 'lodash';
import { ProjectManifest } from '@pnpm/types';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { VariantsMain, Patterns, VariantsAspect } from '@teambit/variants';
import { Component, ComponentID, ComponentMap } from '@teambit/component';
import pMapSeries from 'p-map-series';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { linkToNodeModulesWithCodemod, NodeModulesLinksResult } from '@teambit/workspace.modules.node-modules-linker';
import { IssuesClasses } from '@teambit/component-issues';
import {
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
};

export type WorkspaceLinkResults = {
  legacyLinkResults?: NodeModulesLinksResult[];
  legacyLinkCodemodResults?: CodemodResult[];
} & LinkResults;

export type WorkspaceInstallOptions = {
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
};

export type ModulesInstallOptions = Omit<WorkspaceInstallOptions, 'updateExisting' | 'lifecycleType' | 'import'>;

type PreLink = (linkOpts?: WorkspaceLinkOptions) => Promise<void>;
type PreInstall = (installOpts?: WorkspaceInstallOptions) => Promise<void>;

type PreLinkSlot = SlotRegistry<PreLink>;
type PreInstallSlot = SlotRegistry<PreInstall>;

export class InstallMain {
  constructor(
    private dependencyResolver: DependencyResolverMain,

    private logger: Logger,

    private workspace: Workspace,

    private variants: VariantsMain,

    private compiler: CompilerMain,

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
    return this._installModules(options);
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
        const versionWithPrefix = this.dependencyResolver.getVersionWithSavePrefix(
          resolvedPackage.version,
          options?.savePrefix
        );
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
    this.logger.console(
      `installing dependencies in workspace using ${chalk.cyan(this.dependencyResolver.getPackageManagerName())}`
    );
    this.logger.debug(`installing dependencies in workspace with options`, options);
    const mergedRootPolicy = this.dependencyResolver.getWorkspacePolicy();
    const depsFilterFn = await this.generateFilterFnForDepsFromLocalRemote();
    const hasRootComponents = this.dependencyResolver.hasRootComponents();
    const pmInstallOptions: PackageManagerInstallOptions = {
      dedupe: !hasRootComponents && options?.dedupe,
      copyPeerToRuntimeOnRoot: options?.copyPeerToRuntimeOnRoot ?? true,
      copyPeerToRuntimeOnComponents: options?.copyPeerToRuntimeOnComponents ?? false,
      dependencyFilterFn: depsFilterFn,
      includeOptionalDeps: options?.includeOptionalDeps,
      overrides: this.dependencyResolver.config.overrides,
      packageImportMethod: this.dependencyResolver.config.packageImportMethod,
      rootComponents: hasRootComponents,
    };
    // TODO: pass get install options
    const installer = this.dependencyResolver.getInstaller({});
    let current = await this._getComponentsManifests(installer, mergedRootPolicy, pmInstallOptions);
    const prevManifests = new Set<string>();
    // TODO: this make duplicate
    // this.logger.consoleSuccess();
    // TODO: add the links results to the output
    await this.link({
      linkTeambitBit: true,
      linkCoreAspects: this.dependencyResolver.linkCoreAspects(),
      linkDepsResolvedFromEnv: !hasRootComponents,
      linkNestedDepsInNM: false,
    });
    const linkOpts = {
      linkTeambitBit: false,
      linkCoreAspects: false,
      linkDepsResolvedFromEnv: !hasRootComponents,
      linkNestedDepsInNM: !this.workspace.isLegacy && !hasRootComponents,
    };
    let installCycle = 0;
    let hasMissingLocalComponents = true;
    /* eslint-disable no-await-in-loop */
    do {
      // In case there are missing local components,
      // we'll need to make another round of installation as on the first round the missing local components
      // are not added to the manifests.
      // This is an issue when installation is done using root components.
      hasMissingLocalComponents = hasRootComponents && hasComponentsFromWorkspaceInMissingDeps(current);
      this.workspace.consumer.componentLoader.clearComponentsCache();
      this.workspace.clearCache();
      await installer.installComponents(
        this.workspace.path,
        current.manifests,
        mergedRootPolicy,
        current.componentDirectoryMap,
        { installTeambitBit: false },
        pmInstallOptions
      );
      // Core aspects should be relinked after installation because Yarn removes all symlinks created not by Yarn.
      // If we don't link the core aspects immediately, the components will fail during load.
      await this.linkCoreAspectsAndLegacy({
        linkTeambitBit: false,
        linkCoreAspects: this.dependencyResolver.linkCoreAspects(),
        rootPolicy: mergedRootPolicy,
      });
      if (options?.compile) {
        await this.compiler.compileOnWorkspace([], { initiator: CompilationInitiator.Install });
      }
      await this.link(linkOpts);
      prevManifests.add(hash(current.manifests));
      current = await this._getComponentsManifests(installer, mergedRootPolicy, pmInstallOptions);
      installCycle += 1;
    } while ((!prevManifests.has(hash(current.manifests)) || hasMissingLocalComponents) && installCycle < 5);
    /* eslint-enable no-await-in-loop */
    return current.componentDirectoryMap;
  }

  private async _getComponentsManifests(
    dependencyInstaller: DependencyInstaller,
    rootPolicy: WorkspacePolicy,
    installOptions: Pick<
      PackageManagerInstallOptions,
      'dedupe' | 'dependencyFilterFn' | 'copyPeerToRuntimeOnComponents'
    >
  ): Promise<ComponentsAndManifests> {
    const componentDirectoryMap = await this.getComponentsDirectory([]);
    const manifests = await dependencyInstaller.getComponentManifests({
      ...installOptions,
      componentDirectoryMap,
      rootPolicy,
      rootDir: this.workspace.path,
    });
    return {
      componentDirectoryMap,
      manifests,
    };
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

  async linkCoreAspectsAndLegacy(options: WorkspaceLinkOptions = {}) {
    const linker = this.dependencyResolver.getLinker({
      rootDir: this.workspace.path,
      linkingOptions: options,
    });
    const compIds = await this.workspace.listIds();
    const res = await linker.linkCoreAspectsAndLegacy(this.workspace.path, compIds, options.rootPolicy, options);
    return res;
  }

  async link(options: WorkspaceLinkOptions = {}): Promise<WorkspaceLinkResults> {
    await pMapSeries(this.preLinkSlot.values(), (fn) => fn(options)); // import objects if not disabled in options
    const compDirMap = await this.getComponentsDirectory([]);
    const mergedRootPolicy = this.dependencyResolver.getWorkspacePolicy();
    const linker = this.dependencyResolver.getLinker({
      rootDir: this.workspace.path,
      linkingOptions: options,
    });
    const res = await linker.link(this.workspace.path, mergedRootPolicy, compDirMap, options);
    const workspaceRes = res as WorkspaceLinkResults;

    const bitIds = compDirMap.toArray().map(([component]) => component.id._legacy);
    const legacyResults = await linkToNodeModulesWithCodemod(this.workspace, bitIds, options.rewire ?? false);
    workspaceRes.legacyLinkResults = legacyResults.linksResults;
    workspaceRes.legacyLinkCodemodResults = legacyResults.codemodResults;

    return res;
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

  static slots = [Slot.withType<PreLinkSlot>(), Slot.withType<PreInstallSlot>()];
  static dependencies = [
    DependencyResolverAspect,
    WorkspaceAspect,
    LoggerAspect,
    VariantsAspect,
    CLIAspect,
    CommunityAspect,
    CompilerAspect,
    IssuesAspect,
  ];

  static runtime = MainRuntime;

  static async provider(
    [dependencyResolver, workspace, loggerExt, variants, cli, community, compiler, issues]: [
      DependencyResolverMain,
      Workspace,
      LoggerMain,
      VariantsMain,
      CLIMain,
      CommunityMain,
      CompilerMain,
      IssuesMain
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
      new LinkCommand(installExt, workspace, logger, community.getDocsDomain()),
    ];
    cli.register(...commands);
    if (dependencyResolver.hasRootComponents()) {
      workspace.registerOnMultipleComponentsAdd(async () => {
        await installExt.install(undefined, { compile: true, import: false });
      });
    }
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
