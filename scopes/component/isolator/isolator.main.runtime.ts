import rimraf from 'rimraf';
import { v4 } from 'uuid';
import { MainRuntime } from '@teambit/cli';
import semver from 'semver';
import chalk from 'chalk';
import { compact, flatten, pick } from 'lodash';
import { AspectLoaderMain, AspectLoaderAspect } from '@teambit/aspect-loader';
import { Component, ComponentMap, ComponentAspect, ComponentID } from '@teambit/component';
import type { ComponentMain, ComponentFactory } from '@teambit/component';
import { getComponentPackageVersion, snapToSemver } from '@teambit/component-package-version';
import { createLinks } from '@teambit/dependencies.fs.linked-dependencies';
import { GraphAspect, GraphMain } from '@teambit/graph';
import {
  DependencyResolverAspect,
  DependencyResolverMain,
  LinkingOptions,
  LinkDetail,
  WorkspacePolicy,
  InstallOptions,
  DependencyList,
  ComponentDependency,
  KEY_NAME_BY_LIFECYCLE_TYPE,
  PackageManagerInstallOptions,
} from '@teambit/dependency-resolver';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitId, BitIds } from '@teambit/legacy/dist/bit-id';
import LegacyScope from '@teambit/legacy/dist/scope/scope';
import GlobalConfigAspect, { GlobalConfigMain } from '@teambit/global-config';
import {
  DEPENDENCIES_FIELDS,
  PACKAGE_JSON,
  CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR,
} from '@teambit/legacy/dist/constants';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import {
  ArtifactFiles,
  deserializeArtifactFiles,
  getArtifactFilesByExtension,
  getArtifactFilesExcludeExtension,
  importMultipleDistsArtifacts,
} from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { pathNormalizeToLinux, PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import { Scope } from '@teambit/legacy/dist/scope';
import fs from 'fs-extra';
import hash from 'object-hash';
import path from 'path';
import equals from 'ramda/src/equals';
import DataToPersist from '@teambit/legacy/dist/consumer/component/sources/data-to-persist';
import RemovePath from '@teambit/legacy/dist/consumer/component/sources/remove-path';
import { PackageJsonTransformer } from '@teambit/workspace.modules.node-modules-linker';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { ArtifactVinyl } from '@teambit/legacy/dist/consumer/component/sources/artifact';
import componentIdToPackageName from '@teambit/legacy/dist/utils/bit/component-id-to-package-name';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import { IsolatorAspect } from './isolator.aspect';
import { symlinkOnCapsuleRoot, symlinkDependenciesToCapsules } from './symlink-dependencies-to-capsules';
import { Network } from './network';

export type ListResults = {
  capsules: string[];
};

/**
 * Context for the isolation process
 */
export type IsolationContext = {
  /**
   * Whether the isolation done for aspects (as opposed to regular components)
   */
  aspects?: boolean;

  /**
   * Workspace name where the isolation starts from
   */
  workspaceName?: string;
};

export type IsolateComponentsInstallOptions = {
  installPackages?: boolean; // default: true
  // TODO: add back when depResolver.getInstaller support it
  // packageManager?: string;
  dedupe?: boolean;
  copyPeerToRuntimeOnComponents?: boolean;
  copyPeerToRuntimeOnRoot?: boolean;
  installPeersFromEnvs?: boolean;
  installTeambitBit?: boolean;
  packageManagerConfigRootDir?: string;
  // When set to true, the newly added components will be grouped inside one directory.
  // This is useful for scope aspect capsules, which are installed in stages.
  useNesting?: boolean;
};

type CreateGraphOptions = {
  /**
   * include components that exists in nested hosts. for example include components that exist in scope but not in the workspace
   */
  includeFromNestedHosts?: boolean;

  /**
   * Force specific host to get the component from.
   */
  host?: ComponentFactory;
};

export type IsolateComponentsOptions = CreateGraphOptions & {
  name?: string;
  /**
   * absolute path to put all the capsules dirs inside.
   */
  rootBaseDir?: string;

  /**
   * the capsule root-dir based on a *hash* of this baseDir, not on the baseDir itself.
   * A folder with this hash as its name will be created in the rootBaseDir
   * By default this value will be the host path
   */
  baseDir?: string;

  /**
   * Whether to use hash function (of base dir) as capsules root dir name
   */
  useHash?: boolean;

  /**
   * create a new capsule with a random string attached to the path suffix
   */
  alwaysNew?: boolean;

  /**
   * If this is true -
   * the isolator will check if there are missing capsules in the base dir
   * if yes, it will create the capsule in a special dir inside a dir with the current date (without time)
   * then inside that dir, it will create a dir with a random hash
   * at the end of the process it will move missing capsules from the temp dir to the base dir so they can be used in
   * the next iteration
   */
  useDatedDirs?: boolean;

  /**
   * If set, along with useDatedDirs, then we will use the same hash dir for all capsules created with the same
   * datedDirId
   */
  datedDirId?: string;

  /**
   * installation options
   */
  installOptions?: IsolateComponentsInstallOptions;

  linkingOptions?: LinkingOptions;

  /**
   * delete the capsule rootDir first. it makes sure that the isolation process starts fresh with
   * no previous capsules. for build and tag this is true.
   */
  emptyRootDir?: boolean;

  /**
   * skip the reproduction of the capsule in case it exists.
   */
  skipIfExists?: boolean;

  /**
   * get existing capsule without doing any changes, no writes, no installations.
   */
  getExistingAsIs?: boolean;

  /**
   * place the package-manager cache on the capsule-root
   */
  cachePackagesOnCapsulesRoot?: boolean;

  /**
   * do not build graph with all dependencies. isolate the seeders only.
   */
  seedersOnly?: boolean;

  /**
   * relevant for tagging from scope, where we tag an existing snap without any code-changes.
   * the idea is to have all build artifacts from the previous snap and run deploy pipeline on top of it.
   */
  populateArtifactsFrom?: ComponentID[];

  /**
   * Force specific host to get the component from.
   */
  host?: ComponentFactory;

  /**
   * Use specific package manager for the isolation process (override the package manager from the dep resolver config)
   */
  packageManager?: string;

  /**
   * Dir where to read the package manager config from
   * usually used when running package manager in the capsules dir to use the config
   * from the workspace dir
   */
  packageManagerConfigRootDir?: string;

  context?: IsolationContext;
};

type GetCapsuleDirOpts = Pick<IsolateComponentsOptions, 'datedDirId' | 'useHash' | 'rootBaseDir' | 'useDatedDirs'> & {
  baseDir: string;
};

type CapsulePackageJsonData = {
  capsule: Capsule;
  currentPackageJson?: Record<string, any>;
  previousPackageJson: Record<string, any> | null;
};

const DEFAULT_ISOLATE_INSTALL_OPTIONS: IsolateComponentsInstallOptions = {
  installPackages: true,
  dedupe: true,
  installPeersFromEnvs: true,
  copyPeerToRuntimeOnComponents: false,
  copyPeerToRuntimeOnRoot: true,
};

/**
 * File name to indicate that the capsule is ready (all packages are installed and links are created)
 */
const CAPSULE_READY_FILE = '.bit-capsule-ready';

export class IsolatorMain {
  static runtime = MainRuntime;
  static dependencies = [
    DependencyResolverAspect,
    LoggerAspect,
    ComponentAspect,
    GraphAspect,
    GlobalConfigAspect,
    AspectLoaderAspect,
  ];
  static defaultConfig = {};
  _componentsPackagesVersionCache: { [idStr: string]: string } = {}; // cache packages versions of components
  _datedHashForName = new Map<string, string>(); // cache dated hash for a specific name

  static async provider([dependencyResolver, loggerExtension, componentAspect, graphMain, globalConfig, aspectLoader]: [
    DependencyResolverMain,
    LoggerMain,
    ComponentMain,
    GraphMain,
    GlobalConfigMain,
    AspectLoaderMain
  ]): Promise<IsolatorMain> {
    const logger = loggerExtension.createLogger(IsolatorAspect.id);
    const isolator = new IsolatorMain(
      dependencyResolver,
      logger,
      componentAspect,
      graphMain,
      globalConfig,
      aspectLoader
    );
    return isolator;
  }
  constructor(
    private dependencyResolver: DependencyResolverMain,
    private logger: Logger,
    private componentAspect: ComponentMain,
    private graph: GraphMain,
    private globalConfig: GlobalConfigMain,
    private aspectLoader: AspectLoaderMain
  ) {}

  // TODO: the legacy scope used for the component writer, which then decide if it need to write the artifacts and dists
  // TODO: we should think of another way to provide it (maybe a new opts) then take the scope internally from the host
  async isolateComponents(
    seeders: ComponentID[],
    opts: IsolateComponentsOptions,
    legacyScope?: LegacyScope
  ): Promise<Network> {
    const host = this.componentAspect.getHost();
    this.logger.debug(
      `isolateComponents, ${seeders.join(', ')}. opts: ${JSON.stringify(
        Object.assign({}, opts, { host: opts.host?.name })
      )}`
    );
    const createGraphOpts = pick(opts, ['includeFromNestedHosts', 'host']);
    const componentsToIsolate = opts.seedersOnly
      ? await host.getMany(seeders)
      : await this.createGraph(seeders, createGraphOpts);
    this.logger.debug(`isolateComponents, total componentsToIsolate: ${componentsToIsolate.length}`);
    const seedersWithVersions = seeders.map((seeder) => {
      if (seeder._legacy.hasVersion()) return seeder;
      const comp = componentsToIsolate.find((component) => component.id.isEqual(seeder, { ignoreVersion: true }));
      if (!comp) throw new Error(`unable to find seeder ${seeder.toString()} in componentsToIsolate`);
      return comp.id;
    });
    opts.baseDir = opts.baseDir || host.path;
    const shouldUseDatedDirs = this.shouldUseDatedDirs(componentsToIsolate, opts);
    const capsuleDir = this.getCapsulesRootDir({
      ...opts,
      useDatedDirs: shouldUseDatedDirs,
      baseDir: opts.baseDir || '',
    });
    const capsuleList = await this.createCapsules(componentsToIsolate, capsuleDir, opts, legacyScope);
    this.logger.debug(
      `creating network with base dir: ${opts.baseDir}, rootBaseDir: ${opts.rootBaseDir}. final capsule-dir: ${capsuleDir}. capsuleList: ${capsuleList.length}`
    );
    if (shouldUseDatedDirs) {
      const targetCapsuleDir = this.getCapsulesRootDir({ ...opts, useDatedDirs: false, baseDir: opts.baseDir || '' });
      this.registerMoveCapsuleOnProcessExit(capsuleDir, targetCapsuleDir);
      // TODO: ideally this should be inside the on process exit hook
      // but this is an async op which make it a bit hard
      await this.relinkCoreAspectsInCapsuleDir(targetCapsuleDir);
    }
    return new Network(capsuleList, seedersWithVersions, capsuleDir);
  }

  private async createGraph(seeders: ComponentID[], opts: CreateGraphOptions = {}): Promise<Component[]> {
    const host = this.componentAspect.getHost();
    const getGraphOpts = pick(opts, ['host']);
    const graph = await this.graph.getGraphIds(seeders, getGraphOpts);
    const successorsSubgraph = graph.successorsSubgraph(seeders.map((id) => id.toString()));
    const compsAndDepsIds = successorsSubgraph.nodes.map((node) => node.attr);
    // do not ignore the version here. a component might be in .bitmap with one version and
    // installed as a package with another version. we don't want them both.
    const existingCompsIds = await Promise.all(
      compsAndDepsIds.map(async (id) => {
        let existing;
        if (opts.includeFromNestedHosts) {
          existing = await host.hasIdNested(id, true);
        } else {
          existing = await host.hasId(id);
        }
        if (existing) return id;
        return undefined;
      })
    );
    const existingComps = await host.getMany(compact(existingCompsIds));
    return existingComps;
  }

  private registerMoveCapsuleOnProcessExit(datedCapsuleDir: string, targetCapsuleDir: string): void {
    const cacheCapsules = process.env.CACHE_CAPSULES;
    if (!cacheCapsules) return;
    this.logger.info(`registering process.on(exit) to move capsules from ${datedCapsuleDir} to ${targetCapsuleDir}`);
    process.on('exit', () => {
      this.logger.info(`start moving capsules from ${datedCapsuleDir} to ${targetCapsuleDir}`);
      const allDirs = fs
        .readdirSync(datedCapsuleDir, { withFileTypes: true })
        .filter((dir) => dir.isDirectory() && dir.name !== 'node_modules');
      allDirs.forEach((dir) => {
        const sourceDir = path.join(datedCapsuleDir, dir.name);
        const sourceCapsuleReadyFile = this.getCapsuleReadyFilePath(sourceDir);
        if (!fs.pathExistsSync(sourceCapsuleReadyFile)) {
          // Capsule is not ready, don't copy it to the cache
          this.logger.console(`skipping moving capsule to cache as it is not ready ${sourceDir}`);
          return;
        }
        const targetDir = path.join(targetCapsuleDir, dir.name);
        if (fs.pathExistsSync(path.join(targetCapsuleDir, dir.name))) {
          const targetCapsuleReadyFile = this.getCapsuleReadyFilePath(targetDir);
          if (fs.pathExistsSync(targetCapsuleReadyFile)) {
            // Capsule is already in the cache, no need to move it
            this.logger.console(`skipping moving capsule to cache as it is already exist at ${targetDir}`);
            return;
          }
          this.logger.console(`cleaning target capsule location as it's not ready at: ${targetDir}`);
          rimraf.sync(targetDir);
        }
        this.logger.console(`moving specific capsule from ${sourceDir} to ${targetDir}`);
        // We delete the ready file path first, as the move might take a long time, so we don't want to move
        // the ready file indicator before the capsule is ready in the new location
        this.removeCapsuleReadyFileSync(sourceDir);
        this.moveWithTempName(sourceDir, targetDir);
        // Mark the capsule as ready in the new location
        this.writeCapsuleReadyFileSync(targetDir);
      });
    });
  }

  /**
   * The function moves a directory from a source location to a target location using a temporary directory.
   * This is using temp dir because sometime the source dir and target dir might be in different FS
   * (for example different mounts) which means the move might take a long time
   * during the time of moving, another process will see that the capsule is not ready and will try to remove then
   * move it again, which lead to the first process throwing an error
   * @param sourceDir - The source directory from where the files or directories will be moved.
   * @param targetDir - The target directory where the source directory will be moved to.
   */
  private moveWithTempName(sourceDir, targetDir): void {
    const tempDir = `${targetDir}-${v4()}`;
    this.logger.console(`moving capsule from ${sourceDir} to a temp dir ${tempDir}`);
    fs.moveSync(sourceDir, tempDir);
    // This might exist if in the time when we move to the temp dir, another process created the target dir already
    if (fs.existsSync(targetDir)) {
      this.logger.console(`skip moving capsule from temp dir to real dir as it's already exist: ${targetDir}`);
      // Clean leftovers
      rimraf.sync(tempDir);
      return;
    }
    this.logger.console(`moving capsule from a temp dir ${tempDir} to the target dir ${targetDir}`);
    fs.moveSync(tempDir, targetDir);
  }

  /**
   * Re-create the core aspects links in the real capsule dir
   * This is required mainly for the first time when that folder is empty
   */
  private async relinkCoreAspectsInCapsuleDir(capsulesDir: string): Promise<void> {
    const linkingOptions = {
      linkTeambitBit: true,
      linkCoreAspects: true,
    };
    const linker = this.dependencyResolver.getLinker({
      rootDir: capsulesDir,
      linkingOptions,
      linkingContext: { inCapsule: true },
    });
    const { linkedRootDeps } = await linker.calculateLinkedDeps(capsulesDir, ComponentMap.create([]), linkingOptions);
    // This links are in the global cache which used by many process
    // we don't want to delete and re-create the links if they already exist and valid
    return createLinks(capsulesDir, linkedRootDeps, { skipIfSymlinkValid: true });
  }

  private shouldUseDatedDirs(componentsToIsolate: Component[], opts: IsolateComponentsOptions): boolean {
    if (!opts.useDatedDirs) return false;
    // No need to use the dated dirs in case we anyway create new capsule for each one
    if (opts.alwaysNew) return false;
    // if (opts.skipIfExists) return false;
    // no point to use dated dir in case of getExistingAsIs as it will be just always empty
    if (opts.getExistingAsIs) return false;
    // Do not use the dated dirs in case we don't use nesting, as the capsules
    // will not work after moving to the real dir
    if (!opts.installOptions?.useNesting) return false;
    // Getting the real capsule dir to check if all capsules exists
    const realCapsulesDir = this.getCapsulesRootDir({ ...opts, useDatedDirs: false, baseDir: opts.baseDir || '' });
    // validate all capsules in the real location exists and valid
    const allCapsulesExists = componentsToIsolate.every((component) => {
      const capsuleDir = path.join(realCapsulesDir, Capsule.getCapsuleDirName(component));
      const readyFilePath = this.getCapsuleReadyFilePath(capsuleDir);
      return fs.existsSync(capsuleDir) && fs.existsSync(readyFilePath);
    });
    if (allCapsulesExists) {
      this.logger.console(
        `All required capsules already exists and valid in the real (cached) location: ${realCapsulesDir}`
      );
      return false;
    }
    this.logger.console(
      `Missing required capsules in the real (cached) location: ${realCapsulesDir}, using dated (temp) dir`
    );
    return true;
  }

  /**
   *
   * @param originalCapsule the capsule that contains the original component
   * @param newBaseDir relative path. (it will be saved inside `this.getRootDirOfAllCapsules()`. the final path of the capsule will be getRootDirOfAllCapsules() + newBaseDir + filenameify(component.id))
   * @returns a new capsule with the same content of the original capsule but with a new baseDir and all packages
   * installed in the newBaseDir.
   */
  async cloneCapsule(originalCapsule: Capsule, newBaseDir: string): Promise<Capsule> {
    const network = await this.isolateComponents([originalCapsule.component.id], { baseDir: newBaseDir });
    const clonedCapsule = network.seedersCapsules[0];
    await fs.copy(originalCapsule.path, clonedCapsule.path);
    return clonedCapsule;
  }

  /**
   * Create capsules for the provided components
   * do not use this outside directly, use isolate components which build the entire network
   * @param components
   * @param opts
   * @param legacyScope
   */
  private async createCapsules(
    components: Component[],
    capsulesDir: string,
    opts: IsolateComponentsOptions,
    legacyScope?: Scope
  ): Promise<CapsuleList> {
    this.logger.debug(`createCapsules, ${components.length} components`);

    let longProcessLogger;
    if (opts.context?.aspects) {
      // const wsPath = opts.host?.path || 'unknown';
      const wsPath = opts.context.workspaceName || opts.host?.path || opts.name || 'unknown';
      longProcessLogger = this.logger.createLongProcessLogger(
        `ensuring ${chalk.cyan(components.length.toString())} capsule(s) for all envs and aspects for ${chalk.bold(
          wsPath
        )} at ${chalk.bold(capsulesDir)}`
      );
    }
    const installOptions = {
      ...DEFAULT_ISOLATE_INSTALL_OPTIONS,
      ...opts.installOptions,
      useNesting: this.dependencyResolver.isolatedCapsules() && opts.installOptions?.useNesting,
    };
    if (!opts.emptyRootDir) {
      installOptions.dedupe = installOptions.dedupe && this.dependencyResolver.supportsDedupingOnExistingRoot();
    }
    const config = { installPackages: true, ...opts };
    if (opts.emptyRootDir) {
      await fs.emptyDir(capsulesDir);
    }
    let capsules = await this.createCapsulesFromComponents(components, capsulesDir, config);
    const allCapsuleList = CapsuleList.fromArray(capsules);
    let capsuleList = allCapsuleList;
    if (opts.getExistingAsIs) {
      return capsuleList;
    }

    if (opts.skipIfExists) {
      if (!installOptions.useNesting) {
        const existingCapsules = CapsuleList.fromArray(
          capsuleList.filter((capsule) => capsule.fs.existsSync('package.json'))
        );

        if (existingCapsules.length === capsuleList.length) return existingCapsules;
      } else {
        capsules = capsules.filter((capsule) => !capsule.fs.existsSync('package.json'));
        capsuleList = CapsuleList.fromArray(capsules);
      }
    }
    const capsulesWithPackagesData = await this.getCapsulesPreviousPackageJson(capsules);

    await this.writeComponentsInCapsules(components, capsuleList, legacyScope, opts);
    await this.updateWithCurrentPackageJsonData(capsulesWithPackagesData, capsuleList);
    if (installOptions.installPackages) {
      const cachePackagesOnCapsulesRoot = opts.cachePackagesOnCapsulesRoot ?? false;
      const linkingOptions = opts.linkingOptions ?? {};
      let installLongProcessLogger;
      // Only show the log message in case we are going to install something
      if (capsuleList && capsuleList.length && !opts.context?.aspects) {
        installLongProcessLogger = this.logger.createLongProcessLogger('install packages in capsules');
      }
      if (installOptions.useNesting) {
        await Promise.all(
          capsuleList.map(async (capsule) => {
            const newCapsuleList = CapsuleList.fromArray([capsule]);
            const linkedDependencies = await this.linkInCapsules(
              capsulesDir,
              newCapsuleList,
              capsulesWithPackagesData,
              linkingOptions
            );
            await this.installInCapsules(capsule.path, newCapsuleList, installOptions, {
              cachePackagesOnCapsulesRoot,
              linkedDependencies,
              packageManager: opts.packageManager,
            });
          })
        );
      } else {
        const linkedDependencies = await this.linkInCapsules(
          capsulesDir,
          capsuleList,
          capsulesWithPackagesData,
          linkingOptions
        );
        await this.installInCapsules(capsulesDir, capsuleList, installOptions, {
          cachePackagesOnCapsulesRoot,
          linkedDependencies,
          packageManager: opts.packageManager,
        });
      }
      if (installLongProcessLogger) {
        installLongProcessLogger.end();
        this.logger.consoleSuccess('installed packages in capsules');
      }
    }

    // rewrite the package-json with the component dependencies in it. the original package.json
    // that was written before, didn't have these dependencies in order for the package-manager to
    // be able to install them without crushing when the versions don't exist yet
    capsulesWithPackagesData.forEach((capsuleWithPackageData) => {
      const { currentPackageJson, capsule } = capsuleWithPackageData;
      if (!currentPackageJson)
        throw new Error(
          `isolator.createCapsules, unable to find currentPackageJson for ${capsule.component.id.toString()}`
        );
      capsuleWithPackageData.capsule.fs.writeFileSync(PACKAGE_JSON, JSON.stringify(currentPackageJson, null, 2));
    });
    await this.markCapsulesAsReady(capsuleList);
    // Only show this message if at least one new capsule created
    if (longProcessLogger && capsuleList.length) {
      longProcessLogger.end();
      // this.logger.consoleSuccess();
      const capsuleListOutput = allCapsuleList.map((capsule) => capsule.component.id.toString()).join(', ');
      this.logger.consoleSuccess(`resolved aspect(s): ${chalk.cyan(capsuleListOutput)}`);
    }

    return allCapsuleList;
  }

  private async markCapsulesAsReady(capsuleList: CapsuleList): Promise<void> {
    await Promise.all(
      capsuleList.map(async (capsule) => {
        return this.markCapsuleAsReady(capsule);
      })
    );
  }

  private async markCapsuleAsReady(capsule: Capsule): Promise<void> {
    const readyFilePath = this.getCapsuleReadyFilePath(capsule.path);
    return fs.writeFile(readyFilePath, '');
  }

  private removeCapsuleReadyFileSync(capsulePath: string): void {
    const readyFilePath = this.getCapsuleReadyFilePath(capsulePath);
    const exist = fs.pathExistsSync(readyFilePath);
    if (!exist) return;
    fs.removeSync(readyFilePath);
  }

  private writeCapsuleReadyFileSync(capsulePath: string): void {
    const readyFilePath = this.getCapsuleReadyFilePath(capsulePath);
    const exist = fs.pathExistsSync(readyFilePath);
    if (exist) return;
    fs.writeFileSync(readyFilePath, '');
  }

  private getCapsuleReadyFilePath(capsulePath: string): string {
    return path.join(capsulePath, CAPSULE_READY_FILE);
  }

  private async installInCapsules(
    capsulesDir: string,
    capsuleList: CapsuleList,
    isolateInstallOptions: IsolateComponentsInstallOptions,
    opts: {
      cachePackagesOnCapsulesRoot?: boolean;
      linkedDependencies?: Record<string, Record<string, string>>;
      packageManager?: string;
    }
  ) {
    const installer = this.dependencyResolver.getInstaller({
      rootDir: capsulesDir,
      cacheRootDirectory: opts.cachePackagesOnCapsulesRoot ? capsulesDir : undefined,
      installingContext: { inCapsule: true },
      packageManager: opts.packageManager,
    });
    // When using isolator we don't want to use the policy defined in the workspace directly,
    // we only want to instal deps from components and the peer from the workspace

    const peerOnlyPolicy = this.getWorkspacePeersOnlyPolicy();
    const installOptions: InstallOptions = {
      installTeambitBit: !!isolateInstallOptions.installTeambitBit,
      packageManagerConfigRootDir: isolateInstallOptions.packageManagerConfigRootDir,
      resolveVersionsFromDependenciesOnly: true,
      linkedDependencies: opts.linkedDependencies,
      forceTeambitHarmonyLink: !this.dependencyResolver.hasHarmonyInRootPolicy(),
      excludeExtensionsDependencies: true,
    };

    const packageManagerInstallOptions: PackageManagerInstallOptions = {
      dedupe: isolateInstallOptions.dedupe,
      copyPeerToRuntimeOnComponents: isolateInstallOptions.copyPeerToRuntimeOnComponents,
      copyPeerToRuntimeOnRoot: isolateInstallOptions.copyPeerToRuntimeOnRoot,
      installPeersFromEnvs: isolateInstallOptions.installPeersFromEnvs,
      nmSelfReferences: this.dependencyResolver.isolatedCapsules(),
      overrides: this.dependencyResolver.config.capsulesOverrides || this.dependencyResolver.config.overrides,
      rootComponentsForCapsules: this.dependencyResolver.isolatedCapsules(),
      useNesting: isolateInstallOptions.useNesting,
      keepExistingModulesDir: this.dependencyResolver.isolatedCapsules(),
      hasRootComponents: this.dependencyResolver.isolatedCapsules(),
    };
    await installer.install(
      capsulesDir,
      peerOnlyPolicy,
      this.toComponentMap(capsuleList),
      installOptions,
      packageManagerInstallOptions
    );
  }

  private async linkInCapsules(
    capsulesDir: string,
    capsuleList: CapsuleList,
    capsulesWithPackagesData: CapsulePackageJsonData[],
    linkingOptions: LinkingOptions
  ): Promise<Record<string, Record<string, string>>> {
    const linker = this.dependencyResolver.getLinker({
      rootDir: capsulesDir,
      linkingOptions,
      linkingContext: { inCapsule: true },
    });
    const { linkedRootDeps } = await linker.calculateLinkedDeps(capsulesDir, this.toComponentMap(capsuleList), {
      ...linkingOptions,
      linkNestedDepsInNM: !this.dependencyResolver.isolatedCapsules() && linkingOptions.linkNestedDepsInNM,
    });
    let rootLinks: LinkDetail[] | undefined;
    let nestedLinks: Record<string, Record<string, string>> | undefined;
    if (!this.dependencyResolver.isolatedCapsules()) {
      rootLinks = await symlinkOnCapsuleRoot(capsuleList, this.logger, capsulesDir);
      const capsulesWithModifiedPackageJson = this.getCapsulesWithModifiedPackageJson(capsulesWithPackagesData);
      nestedLinks = await symlinkDependenciesToCapsules(capsulesWithModifiedPackageJson, capsuleList, this.logger);
    } else {
      const coreAspectIds = this.aspectLoader.getCoreAspectIds();
      const coreAspectCapsules = CapsuleList.fromArray(
        capsuleList.filter((capsule) => {
          const [compIdWithoutVersion] = capsule.component.id.toString().split('@');
          return coreAspectIds.includes(compIdWithoutVersion);
        })
      );
      rootLinks = await symlinkOnCapsuleRoot(coreAspectCapsules, this.logger, capsulesDir);
    }
    return {
      ...nestedLinks,
      [capsulesDir]: {
        ...linkedRootDeps,
        ...this.toLocalLinks(rootLinks),
      },
    };
  }

  private toLocalLinks(rootLinks: LinkDetail[] | undefined): Record<string, string> {
    const localLinks: Array<[string, string]> = [];
    if (rootLinks) {
      rootLinks.forEach((link) => {
        localLinks.push(this.linkDetailToLocalDepEntry(link));
      });
    }
    return Object.fromEntries(localLinks.map(([key, value]) => [key, `link:${value}`]));
  }

  private linkDetailToLocalDepEntry(linkDetail: LinkDetail): [string, string] {
    return [linkDetail.packageName, linkDetail.from];
  }

  private getCapsulesWithModifiedPackageJson(capsulesWithPackagesData: CapsulePackageJsonData[]) {
    const capsulesWithModifiedPackageJson: Capsule[] = capsulesWithPackagesData
      .filter((capsuleWithPackageData) => {
        const packageJsonHasChanged = this.wereDependenciesInPackageJsonChanged(capsuleWithPackageData);
        // @todo: when a component is tagged, it changes all package-json of its dependents, but it
        // should not trigger any "npm install" because they dependencies are symlinked by us
        return packageJsonHasChanged;
      })
      .map((capsuleWithPackageData) => capsuleWithPackageData.capsule);
    return capsulesWithModifiedPackageJson;
  }

  private async writeComponentsInCapsules(
    components: Component[],
    capsuleList: CapsuleList,
    legacyScope?: Scope,
    opts?: IsolateComponentsOptions
  ) {
    const modifiedComps: Component[] = [];
    const unmodifiedComps: Component[] = [];
    await Promise.all(
      components.map(async (component) => {
        if (await CapsuleList.capsuleUsePreviouslySavedDists(component)) {
          unmodifiedComps.push(component);
        } else {
          modifiedComps.push(component);
        }
      })
    );
    const legacyUnmodifiedComps = unmodifiedComps.map((component) => component.state._consumer.clone());
    const legacyModifiedComps = modifiedComps.map((component) => component.state._consumer.clone());
    const legacyComponents = [...legacyUnmodifiedComps, ...legacyModifiedComps];
    if (legacyScope && unmodifiedComps.length) await importMultipleDistsArtifacts(legacyScope, legacyUnmodifiedComps);
    const allIds = BitIds.fromArray(legacyComponents.map((c) => c.id));
    await Promise.all(
      components.map(async (component) => {
        const capsule = capsuleList.getCapsule(component.id);
        if (!capsule) return;
        const scope =
          (await CapsuleList.capsuleUsePreviouslySavedDists(component)) || opts?.populateArtifactsFrom
            ? legacyScope
            : undefined;
        const dataToPersist = await this.populateComponentsFilesToWriteForCapsule(component, allIds, scope, opts);
        await dataToPersist.persistAllToCapsule(capsule, { keepExistingCapsule: true });
      })
    );
  }

  private getWorkspacePeersOnlyPolicy(): WorkspacePolicy {
    const workspacePolicy = this.dependencyResolver.getWorkspacePolicy();
    const peerOnlyPolicy = workspacePolicy.byLifecycleType('peer');
    return peerOnlyPolicy;
  }

  private toComponentMap(capsuleList: CapsuleList): ComponentMap<string> {
    const tuples: [Component, string][] = capsuleList.map((capsule) => {
      return [capsule.component, capsule.path];
    });

    return ComponentMap.create(tuples);
  }

  async list(rootDir: string): Promise<ListResults> {
    try {
      const capsules = await fs.readdir(rootDir);
      const withoutNodeModules = capsules.filter((c) => c !== 'node_modules');
      const capsuleFullPaths = withoutNodeModules.map((c) => path.join(rootDir, c));
      return {
        capsules: capsuleFullPaths,
      };
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        return { capsules: [] };
      }
      throw e;
    }
  }

  /** @deprecated use the new function signature with an object parameter instead */
  getCapsulesRootDir(baseDir: string, rootBaseDir?: string, useHash?: boolean): PathOsBasedAbsolute;
  getCapsulesRootDir(getCapsuleDirOpts: GetCapsuleDirOpts): PathOsBasedAbsolute;
  getCapsulesRootDir(
    getCapsuleDirOpts: GetCapsuleDirOpts | string,
    rootBaseDir?: string,
    useHash = true,
    useDatedDirs = false,
    datedDirId?: string
  ): PathOsBasedAbsolute {
    if (typeof getCapsuleDirOpts === 'string') {
      getCapsuleDirOpts = { baseDir: getCapsuleDirOpts, rootBaseDir, useHash, useDatedDirs, datedDirId };
    }
    const getCapsuleDirOptsWithDefaults = {
      useHash: true,
      useDatedDirs: false,
      ...getCapsuleDirOpts,
    };
    const capsulesRootBaseDir = getCapsuleDirOptsWithDefaults.rootBaseDir || this.getRootDirOfAllCapsules();
    if (getCapsuleDirOptsWithDefaults.useDatedDirs) {
      const date = new Date();
      const dateDir = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const defaultDatedBaseDir = 'dated-capsules';
      const datedBaseDir = this.globalConfig.getSync(CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR) || defaultDatedBaseDir;
      let hashDir;
      const finalDatedDirId = getCapsuleDirOpts.datedDirId;
      if (finalDatedDirId && this._datedHashForName.has(finalDatedDirId)) {
        hashDir = this._datedHashForName.get(finalDatedDirId);
      } else {
        hashDir = v4();
        if (finalDatedDirId) {
          this._datedHashForName.set(finalDatedDirId, hashDir);
        }
      }
      return path.join(capsulesRootBaseDir, datedBaseDir, dateDir, hashDir);
    }
    const dir = getCapsuleDirOptsWithDefaults.useHash
      ? hash(getCapsuleDirOptsWithDefaults.baseDir)
      : getCapsuleDirOptsWithDefaults.baseDir;
    return path.join(capsulesRootBaseDir, dir);
  }

  async deleteCapsules(rootDir?: string): Promise<string> {
    const dirToDelete = rootDir || this.getRootDirOfAllCapsules();
    await fs.remove(dirToDelete);
    return dirToDelete;
  }

  private async createCapsulesFromComponents(
    components: Component[],
    baseDir: string,
    opts: IsolateComponentsOptions
  ): Promise<Capsule[]> {
    this.logger.debug(`createCapsulesFromComponents: ${components.length} components`);
    const capsules: Capsule[] = await Promise.all(
      components.map((component: Component) => {
        return Capsule.createFromComponent(component, baseDir, opts);
      })
    );
    return capsules;
  }

  private getRootDirOfAllCapsules(): string {
    return this.globalConfig.getGlobalCapsulesBaseDir();
  }

  private wereDependenciesInPackageJsonChanged(capsuleWithPackageData: CapsulePackageJsonData): boolean {
    const { previousPackageJson, currentPackageJson } = capsuleWithPackageData;
    if (!previousPackageJson) return true;
    // @ts-ignore at this point, currentPackageJson is set
    return DEPENDENCIES_FIELDS.some((field) => !equals(previousPackageJson[field], currentPackageJson[field]));
  }

  private async getCapsulesPreviousPackageJson(capsules: Capsule[]): Promise<CapsulePackageJsonData[]> {
    return Promise.all(
      capsules.map(async (capsule) => {
        const packageJsonPath = path.join(capsule.path, 'package.json');
        let previousPackageJson: any = null;
        try {
          const previousPackageJsonRaw = await capsule.fs.promises.readFile(packageJsonPath, { encoding: 'utf8' });
          previousPackageJson = JSON.parse(previousPackageJsonRaw);
        } catch (e: any) {
          // package-json doesn't exist in the capsule, that's fine, it'll be considered as a cache miss
        }
        return {
          capsule,
          previousPackageJson,
        };
      })
    );
  }

  private async updateWithCurrentPackageJsonData(
    capsulesWithPackagesData: CapsulePackageJsonData[],
    capsules: CapsuleList
  ) {
    return Promise.all(
      capsules.map(async (capsule) => {
        const packageJson = await this.getCurrentPackageJson(capsule, capsules);
        const found = capsulesWithPackagesData.filter((c) => c.capsule.component.id.isEqual(capsule.component.id));
        if (!found.length) throw new Error(`updateWithCurrentPackageJsonData unable to find ${capsule.component.id}`);
        if (found.length > 1)
          throw new Error(
            `updateWithCurrentPackageJsonData found duplicate capsules: ${capsule.component.id.toString()}""`
          );
        found[0].currentPackageJson = packageJson.packageJsonObject;
      })
    );
  }

  private async getCurrentPackageJson(capsule: Capsule, capsules: CapsuleList): Promise<PackageJsonFile> {
    const component: Component = capsule.component;
    const currentVersion = getComponentPackageVersion(component);
    const getComponentDepsManifest = async (dependencies: DependencyList) => {
      const manifest = {
        dependencies: {},
        devDependencies: {},
      };
      const compDeps = dependencies.toTypeArray<ComponentDependency>('component');
      const promises = compDeps.map(async (dep) => {
        const depCapsule = capsules.getCapsule(dep.componentId);
        let version = dep.version;
        if (depCapsule) {
          version = getComponentPackageVersion(depCapsule?.component);
        } else {
          version = snapToSemver(version);
        }
        const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[dep.lifecycle];
        const entry = dep.toManifest();
        if (entry) {
          manifest[keyName][entry.packageName] = version;
        }
      });
      await Promise.all(promises);
      return manifest;
    };
    const deps = await this.dependencyResolver.getDependencies(component);
    const manifest = await getComponentDepsManifest(deps);

    // component.packageJsonFile is not available here. we don't mutate the component object for capsules.
    // also, don't use `PackageJsonFile.createFromComponent`, as it looses the intermediate changes
    // such as postInstall scripts for custom-module-resolution.
    const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);

    const addDependencies = (packageJsonFile: PackageJsonFile) => {
      packageJsonFile.addDependencies(manifest.dependencies);
      packageJsonFile.addDevDependencies(manifest.devDependencies);
    };
    addDependencies(packageJson);
    packageJson.addOrUpdateProperty('version', currentVersion);
    return packageJson;
  }

  async populateComponentsFilesToWriteForCapsule(
    component: Component,
    ids: BitIds,
    legacyScope?: Scope,
    opts?: IsolateComponentsOptions
  ): Promise<DataToPersist> {
    const legacyComp: ConsumerComponent = component.state._consumer;
    const dataToPersist = new DataToPersist();
    const clonedFiles = legacyComp.files.map((file) => file.clone());
    const writeToPath = '.';
    clonedFiles.forEach((file) => file.updatePaths({ newBase: writeToPath }));
    dataToPersist.removePath(new RemovePath(writeToPath));
    clonedFiles.map((file) => dataToPersist.addFile(file));
    const packageJson = this.preparePackageJsonToWrite(
      component,
      writeToPath,
      ids // this.ignoreBitDependencies,
    );
    if (!legacyComp.id.hasVersion()) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      packageJson.addOrUpdateProperty('version', semver.inc(legacyComp.version!, 'prerelease') || '0.0.1-0');
    }
    await PackageJsonTransformer.applyTransformers(component, packageJson);
    const valuesToMerge = legacyComp.overrides.componentOverridesPackageJsonData;
    packageJson.mergePackageJsonObject(valuesToMerge);
    dataToPersist.addFile(packageJson.toVinylFile());
    const artifacts = await this.getArtifacts(component, legacyScope, opts?.populateArtifactsFrom);
    dataToPersist.addManyFiles(artifacts);
    return dataToPersist;
  }

  private preparePackageJsonToWrite(
    component: Component,
    bitDir: string,
    ignoreBitDependencies: BitIds | boolean = true
  ): PackageJsonFile {
    const legacyComp: ConsumerComponent = component.state._consumer;
    this.logger.debug(`package-json.preparePackageJsonToWrite. bitDir ${bitDir}.`);
    const getBitDependencies = (dependencies: BitIds) => {
      if (ignoreBitDependencies === true) return {};
      return dependencies.reduce((acc, depId: BitId) => {
        if (Array.isArray(ignoreBitDependencies) && ignoreBitDependencies.searchWithoutVersion(depId)) return acc;
        const packageDependency = depId.version;
        const packageName = componentIdToPackageName({
          ...legacyComp,
          id: depId,
          isDependency: true,
        });
        acc[packageName] = packageDependency;
        return acc;
      }, {});
    };
    const bitDependencies = getBitDependencies(legacyComp.dependencies.getAllIds());
    const bitDevDependencies = getBitDependencies(legacyComp.devDependencies.getAllIds());
    const bitExtensionDependencies = getBitDependencies(legacyComp.extensions.extensionsBitIds);
    const packageJson = PackageJsonFile.createFromComponent(bitDir, legacyComp, true);
    const main = pathNormalizeToLinux(legacyComp.mainFile);
    packageJson.addOrUpdateProperty('main', main);
    const addDependencies = (packageJsonFile: PackageJsonFile) => {
      packageJsonFile.addDependencies(bitDependencies);
      packageJsonFile.addDevDependencies({
        ...bitDevDependencies,
        ...bitExtensionDependencies,
      });
    };
    addDependencies(packageJson);
    const currentVersion = getComponentPackageVersion(component);
    packageJson.addOrUpdateProperty('version', currentVersion);

    return packageJson;
  }

  /**
   * currently, it writes all artifacts.
   * later, this responsibility might move to pkg extension, which could write only artifacts
   * that are set in package.json.files[], to have a similar structure of a package.
   */
  private async getArtifacts(
    component: Component,
    legacyScope?: Scope,
    populateArtifactsFrom?: ComponentID[]
  ): Promise<AbstractVinyl[]> {
    const legacyComp: ConsumerComponent = component.state._consumer;
    if (!legacyScope) {
      if (populateArtifactsFrom) throw new Error(`unable to fetch from parent, the legacyScope was not provided`);
      // when capsules are written via the workspace, do not write artifacts, they get created by
      // build-pipeline. when capsules are written via the scope, we do need the dists.
      return [];
    }
    if (legacyComp.buildStatus !== 'succeed' && !populateArtifactsFrom) {
      // this is important for "bit sign" when on lane to not go to the original scope
      return [];
    }
    const artifactFilesToFetch = async () => {
      if (populateArtifactsFrom) {
        const found = populateArtifactsFrom.find((id) => id.isEqual(component.id, { ignoreVersion: true }));
        if (!found) {
          throw new Error(
            `getArtifacts: unable to find where to populate the artifacts from for ${component.id.toString()}`
          );
        }
        const compParent = await legacyScope.getConsumerComponent(found._legacy);
        return getArtifactFilesExcludeExtension(compParent.extensions, 'teambit.pkg/pkg');
      }
      const extensionsNamesForArtifacts = ['teambit.compilation/compiler'];
      return flatten(
        extensionsNamesForArtifacts.map((extName) => getArtifactFilesByExtension(legacyComp.extensions, extName))
      );
    };

    const artifactsFiles = await artifactFilesToFetch();
    const artifactsVinylFlattened: ArtifactVinyl[] = [];
    await Promise.all(
      artifactsFiles.map(async (artifactFiles) => {
        if (!artifactFiles) return;
        if (!(artifactFiles instanceof ArtifactFiles)) {
          artifactFiles = deserializeArtifactFiles(artifactFiles);
        }
        // fyi, if this is coming from the isolator aspect, it is optimized to import all at once.
        // see artifact-files.importMultipleDistsArtifacts().
        const vinylFiles = await artifactFiles.getVinylsAndImportIfMissing(legacyComp.id, legacyScope);
        artifactsVinylFlattened.push(...vinylFiles);
      })
    );
    const artifactsDir = legacyComp.writtenPath;
    if (artifactsDir) {
      artifactsVinylFlattened.forEach((a) => a.updatePaths({ newBase: artifactsDir }));
    }
    return artifactsVinylFlattened;
  }
}

IsolatorAspect.addRuntime(IsolatorMain);
