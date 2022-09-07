import { CommunityMain, CommunityAspect } from '@teambit/community';
import ManyComponentsWriter from '@teambit/legacy/dist/consumer/component-ops/many-components-writer';
import { CLIMain, CommandList, CLIAspect, MainRuntime } from '@teambit/cli';
import chalk from 'chalk';
import { WorkspaceAspect, Workspace, ComponentConfigFile } from '@teambit/workspace';
import { pick } from 'lodash';
import { NothingToImport } from '@teambit/legacy/dist/consumer/exceptions';
import { VariantsMain, Patterns, VariantsAspect } from '@teambit/variants';
import { ComponentID, ComponentMap } from '@teambit/component';
import {
  WorkspaceDependencyLifecycleType,
  DependencyResolverMain,
  DependencyResolverAspect,
  PackageManagerInstallOptions,
  ComponentDependency,
  VariantPolicyConfigObject,
  WorkspacePolicyEntry,
  LinkingOptions,
  LinkResults,
  DependencyList,
  OutdatedPkg,
} from '@teambit/dependency-resolver';
import { Importer } from '@teambit/importer';
import { ImportOptions } from '@teambit/legacy/dist/consumer/component-ops/import-components';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';

import { DependencyTypeNotSupportedInPolicy } from './exceptions';
import { InstallAspect } from './install.aspect';
import { pickOutdatedPkgs } from './pick-outdated-pkgs';
import { LinkCommand } from './link';
import InstallCmd from './install.cmd';
import UninstallCmd from './uninstall.cmd';
import UpdateCmd from './update.cmd';

export type WorkspaceLinkOptions = LinkingOptions;

export type WorkspaceInstallOptions = {
  addMissingPeers?: boolean;
  variants?: string;
  lifecycleType?: WorkspaceDependencyLifecycleType;
  dedupe: boolean;
  import: boolean;
  copyPeerToRuntimeOnRoot?: boolean;
  copyPeerToRuntimeOnComponents?: boolean;
  updateExisting: boolean;
  savePrefix?: string;
};

export type ModulesInstallOptions = Omit<WorkspaceInstallOptions, 'updateExisting' | 'lifecycleType' | 'import'>;

export class InstallMain {
  constructor(
    private dependencyResolver: DependencyResolverMain,

    private logger: Logger,

    private workspace: Workspace,

    private variants: VariantsMain
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
    if (options?.import) {
      this.logger.setStatusLine('importing missing objects');
      await this.importObjects();
      this.logger.consoleSuccess();
    }
    return this._installModules(options);
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
    const hasRootComponents = this.dependencyResolver.hasRootComponents();
    // TODO: this make duplicate
    // this.logger.consoleSuccess();
    // TODO: add the links results to the output
    await this.link({
      linkTeambitBit: true,
      legacyLink: true,
      linkCoreAspects: false,
      linkDepsResolvedFromEnv: !hasRootComponents,
      linkNestedDepsInNM: false,
    });
    this.workspace.consumer.componentLoader.clearComponentsCache();
    this.workspace.clearCache();
    // TODO: pass get install options
    const installer = this.dependencyResolver.getInstaller({});
    const compDirMap = await this.getComponentsDirectory([]);
    const mergedRootPolicy = this.dependencyResolver.getWorkspacePolicy();

    const depsFilterFn = await this.generateFilterFnForDepsFromLocalRemote();

    const pmInstallOptions: PackageManagerInstallOptions = {
      dedupe: !hasRootComponents && options?.dedupe,
      copyPeerToRuntimeOnRoot: options?.copyPeerToRuntimeOnRoot ?? true,
      copyPeerToRuntimeOnComponents: options?.copyPeerToRuntimeOnComponents ?? false,
      dependencyFilterFn: depsFilterFn,
      overrides: this.dependencyResolver.config.overrides,
      packageImportMethod: this.dependencyResolver.config.packageImportMethod,
      rootComponents: hasRootComponents,
    };
    await installer.install(
      this.workspace.path,
      mergedRootPolicy,
      compDirMap,
      { installTeambitBit: false },
      pmInstallOptions
    );
    await this.link({
      linkTeambitBit: false,
      legacyLink: true,
      linkCoreAspects: this.dependencyResolver.linkCoreAspects(),
      linkDepsResolvedFromEnv: !hasRootComponents,
      linkNestedDepsInNM: !this.workspace.isLegacy && !hasRootComponents,
    });
    await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
    return compDirMap;
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

  async link(options: WorkspaceLinkOptions = {}): Promise<LinkResults> {
    if (options.fetchObject) {
      await this.importObjects();
    }
    options.consumer = this.workspace.consumer;
    const compDirMap = await this.getComponentsDirectory([]);
    const mergedRootPolicy = this.dependencyResolver.getWorkspacePolicy();
    const linker = this.dependencyResolver.getLinker({
      rootDir: this.workspace.path,
      linkingOptions: options,
    });
    const res = await linker.link(this.workspace.path, mergedRootPolicy, compDirMap, options);
    return res;
  }

  // TODO: replace with a proper import API on the workspace
  private async importObjects() {
    const importOptions: ImportOptions = {
      ids: [],
      verbose: false,
      merge: false,
      objectsOnly: true,
      override: false,
      writeDists: false,
      writeConfig: false,
      installNpmPackages: false,
      importDependenciesDirectly: false,
      importDependents: false,
    };
    const importer = new Importer(this.workspace, this.dependencyResolver);
    try {
      const res = await importer.import(importOptions, []);
      return res;
    } catch (err: any) {
      // TODO: this is a hack since the legacy throw an error, we should provide a way to not throw this error from the legacy
      if (err instanceof NothingToImport) {
        // Do not write nothing to import warning
        return undefined;
      }
      throw err;
    }
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

  static slots = [];
  // define your aspect dependencies here.
  // in case you need to use another aspect API.
  static dependencies = [
    DependencyResolverAspect,
    WorkspaceAspect,
    LoggerAspect,
    VariantsAspect,
    CLIAspect,
    CommunityAspect,
  ];

  static runtime = MainRuntime;

  static async provider([dependencyResolver, workspace, loggerExt, variants, cli, community]: [
    DependencyResolverMain,
    Workspace,
    LoggerMain,
    VariantsMain,
    CLIMain,
    CommunityMain
  ]) {
    const logger = loggerExt.createLogger('teambit.bit/install');
    const installExt = new InstallMain(dependencyResolver, logger, workspace, variants);
    ManyComponentsWriter.registerExternalInstaller({
      install: async () => {
        // TODO: think how we should pass this options
        const installOpts: WorkspaceInstallOptions = {
          dedupe: true,
          updateExisting: false,
          import: false,
        };
        return installExt.install(undefined, installOpts);
      },
    });
    const commands: CommandList = [
      new InstallCmd(installExt, workspace, logger),
      new UninstallCmd(installExt),
      new UpdateCmd(installExt),
      new LinkCommand(installExt, workspace, logger, community.getDocsDomain()),
    ];
    cli.register(...commands);
    return installExt;
  }
}

InstallAspect.addRuntime(InstallMain);

export default InstallMain;
