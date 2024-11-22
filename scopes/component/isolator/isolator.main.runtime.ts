import rimraf from 'rimraf';
import { v4 } from 'uuid';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import semver from 'semver';
import chalk from 'chalk';
import { compact, flatten, isEqual, pick } from 'lodash';
import { AspectLoaderMain, AspectLoaderAspect } from '@teambit/aspect-loader';
import { Component, ComponentMap, ComponentAspect } from '@teambit/component';
import type { ComponentMain, ComponentFactory } from '@teambit/component';
import { getComponentPackageVersion, snapToSemver } from '@teambit/component-package-version';
import { createLinks } from '@teambit/dependencies.fs.linked-dependencies';
import { GraphAspect, GraphMain } from '@teambit/graph';
import { Slot, SlotRegistry } from '@teambit/harmony';
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
  NodeLinker,
} from '@teambit/dependency-resolver';
import { Logger, LoggerAspect, LoggerMain, LongProcessLogger } from '@teambit/logger';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import LegacyScope from '@teambit/legacy/dist/scope/scope';
import { GlobalConfigAspect, GlobalConfigMain } from '@teambit/global-config';
import {
  DEPENDENCIES_FIELDS,
  PACKAGE_JSON,
  CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR,
} from '@teambit/legacy/dist/constants';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import {
  PackageJsonFile,
  ArtifactFiles,
  deserializeArtifactFiles,
  getArtifactFilesByExtension,
  getArtifactFilesExcludeExtension,
  importMultipleDistsArtifacts,
  AbstractVinyl,
  ArtifactVinyl,
  DataToPersist,
  RemovePath,
} from '@teambit/component.sources';
import { pathNormalizeToLinux, PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { Scope } from '@teambit/legacy/dist/scope';
import { type DependenciesGraph } from '@teambit/legacy/dist/scope/models/version';
import fs, { copyFile } from 'fs-extra';
import hash from 'object-hash';
import path, { basename } from 'path';
import { PackageJsonTransformer } from '@teambit/workspace.modules.node-modules-linker';
import pMap from 'p-map';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import { IsolatorAspect } from './isolator.aspect';
import { symlinkOnCapsuleRoot, symlinkDependenciesToCapsules } from './symlink-dependencies-to-capsules';
import { Network } from './network';

export type ListResults = {
  capsules: string[];
};

export type CapsuleTransferFn = (sourceDir: string, targetDir: string) => Promise<void>;

export type CapsuleTransferSlot = SlotRegistry<CapsuleTransferFn>;

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

/**
 * it's normally a sha1 of the workspace/scope dir. 40 chars long. however, Windows is not happy with long paths.
 * so we use a shorter hash. the number 9 is pretty random, it's what we use for short-hash of snaps.
 * we're aware of an extremely low risk of collision. take into account that in most cases you won't have more than 10
 * capsules in the machine.
 */
const CAPSULE_DIR_LENGTH = 9;

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
   * If this is true -
   * the isolator will do few things:
   * 1. in the end of the process it will only move the lock file (pnpm-lock.yaml) into the capsule cache
   * 2. in the beginning of the process it will check if there is a lock file in the capsule cache, if yes it will move
   * it to the temp dated dir
   * 3. it will write env's file into the dated dir (as it only contain the lock file)
   * 4. it will run install in the dated dir (as there is no node_modules there yet)
   */
  cacheLockFileOnly?: boolean;

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
   * relevant when populateArtifactsFrom is set.
   * by default, it uses the package.json created in the previous snap as a base and make the necessary changes.
   * if this is set to true, it will ignore the package.json from the previous snap.
   */
  populateArtifactsIgnorePkgJson?: boolean;

  /**
   * Force specific host to get the component from.
   */
  host?: ComponentFactory;

  /**
   * Use specific package manager for the isolation process (override the package manager from the dep resolver config)
   */
  packageManager?: string;

  /**
   * Use specific node linker for the isolation process (override the package manager from the dep resolver config)
   */
  nodeLinker?: NodeLinker;

  /**
   * Dir where to read the package manager config from
   * usually used when running package manager in the capsules dir to use the config
   * from the workspace dir
   */
  packageManagerConfigRootDir?: string;

  context?: IsolationContext;

  /**
   * Root dir of capsulse cache (used mostly to copy lock file if used with cache lock file only option)
   */
  cacheCapsulesDir?: string;
};

type GetCapsuleDirOpts = Pick<
  IsolateComponentsOptions,
  'datedDirId' | 'useHash' | 'rootBaseDir' | 'useDatedDirs' | 'cacheLockFileOnly'
> & {
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
export const CAPSULE_READY_FILE = '.bit-capsule-ready';

export class IsolatorMain {
  static runtime = MainRuntime;
  static dependencies = [
    DependencyResolverAspect,
    LoggerAspect,
    ComponentAspect,
    GraphAspect,
    GlobalConfigAspect,
    AspectLoaderAspect,
    CLIAspect,
  ];
  static slots = [Slot.withType<CapsuleTransferFn>()];
  static defaultConfig = {};
  _componentsPackagesVersionCache: { [idStr: string]: string } = {}; // cache packages versions of components
  _datedHashForName = new Map<string, string>(); // cache dated hash for a specific name
  _movedLockFiles = new Set(); // cache moved lock files to avoid show warning about them

  static async provider(
    [dependencyResolver, loggerExtension, componentAspect, graphMain, globalConfig, aspectLoader, cli]: [
      DependencyResolverMain,
      LoggerMain,
      ComponentMain,
      GraphMain,
      GlobalConfigMain,
      AspectLoaderMain,
      CLIMain,
    ],
    _config,
    [capsuleTransferSlot]: [CapsuleTransferSlot]
  ): Promise<IsolatorMain> {
    const logger = loggerExtension.createLogger(IsolatorAspect.id);
    const isolator = new IsolatorMain(
      dependencyResolver,
      logger,
      componentAspect,
      graphMain,
      cli,
      globalConfig,
      aspectLoader,
      capsuleTransferSlot
    );
    return isolator;
  }
  constructor(
    private dependencyResolver: DependencyResolverMain,
    private logger: Logger,
    private componentAspect: ComponentMain,
    private graph: GraphMain,
    private cli: CLIMain,
    private globalConfig: GlobalConfigMain,
    private aspectLoader: AspectLoaderMain,
    private capsuleTransferSlot: CapsuleTransferSlot
  ) {}

  // TODO: the legacy scope used for the component writer, which then decide if it need to write the artifacts and dists
  // TODO: we should think of another way to provide it (maybe a new opts) then take the scope internally from the host
  async isolateComponents(
    seeders: ComponentID[],
    opts: IsolateComponentsOptions,
    legacyScope?: LegacyScope
  ): Promise<Network> {
    const host = opts.host || this.componentAspect.getHost();
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
    const cacheCapsulesDir = this.getCapsulesRootDir({ ...opts, useDatedDirs: false, baseDir: opts.baseDir || '' });
    opts.cacheCapsulesDir = cacheCapsulesDir;
    const capsuleList = await this.createCapsules(componentsToIsolate, capsuleDir, opts, legacyScope);
    this.logger.debug(
      `creating network with base dir: ${opts.baseDir}, rootBaseDir: ${opts.rootBaseDir}. final capsule-dir: ${capsuleDir}. capsuleList: ${capsuleList.length}`
    );
    const cacheCapsules = process.env.CACHE_CAPSULES || opts.cacheLockFileOnly;
    if (shouldUseDatedDirs && cacheCapsules) {
      const targetCapsuleDir = this.getCapsulesRootDir({ ...opts, useDatedDirs: false, baseDir: opts.baseDir || '' });
      this.registerMoveCapsuleOnProcessExit(capsuleDir, targetCapsuleDir, opts.cacheLockFileOnly);
      // TODO: ideally this should be inside the on process exit hook
      // but this is an async op which make it a bit hard
      await this.relinkCoreAspectsInCapsuleDir(targetCapsuleDir);
    }
    return new Network(capsuleList, seedersWithVersions, capsuleDir);
  }

  private async createGraph(seeders: ComponentID[], opts: CreateGraphOptions = {}): Promise<Component[]> {
    const host = opts.host || this.componentAspect.getHost();
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

  private registerMoveCapsuleOnProcessExit(
    datedCapsuleDir: string,
    targetCapsuleDir: string,
    cacheLockFileOnly = false
  ): void {
    this.logger.info(`registering process.on(exit) to move capsules from ${datedCapsuleDir} to ${targetCapsuleDir}`);
    this.cli.registerOnBeforeExit(async () => {
      const allDirs = await this.getAllCapsulesDirsFromRoot(datedCapsuleDir);
      if (cacheLockFileOnly) {
        await this.moveCapsulesLockFileToTargetDir(allDirs, datedCapsuleDir, targetCapsuleDir);
      } else {
        await this.moveCapsulesToTargetDir(allDirs, datedCapsuleDir, targetCapsuleDir);
      }
    });
  }

  private async getAllCapsulesDirsFromRoot(rootDir: string): Promise<string[]> {
    const allDirs = await fs.readdir(rootDir, { withFileTypes: true });
    const capsuleDirents = allDirs.filter((dir) => dir.isDirectory() && dir.name !== 'node_modules');
    return capsuleDirents.map((dir) => path.join(rootDir, dir.name));
  }

  private async moveCapsulesLockFileToTargetDir(
    capsulesDirs: string[],
    sourceRootDir: string,
    targetCapsuleDir: string
  ): Promise<void> {
    this.logger.info(`start moving lock files from ${sourceRootDir} to ${targetCapsuleDir}`);
    const promises = capsulesDirs.map(async (sourceDir) => {
      const dirname = path.basename(sourceDir);
      const sourceLockFile = path.join(sourceDir, 'pnpm-lock.yaml');
      // Lock file is not exist, don't copy it to the cache
      if (!fs.pathExistsSync(sourceLockFile)) {
        // It was already moved during the process, do not show the log for it
        if (!this._movedLockFiles.has(sourceLockFile)) {
          this.logger.console(`skipping moving lock file to cache as it is not exist ${sourceDir}`);
        }
        return;
      }
      const targetDir = path.join(targetCapsuleDir, dirname);
      const targetLockFile = path.join(targetDir, 'pnpm-lock.yaml');
      const targetLockFileExists = await fs.pathExists(targetLockFile);
      if (targetLockFileExists) {
        // Lock file is already in the cache, no need to move it
        // this.logger.console(`skipping moving lock file to cache as it is already exist at ${targetDir}`);

        // Delete existing lock file so we can update it
        await fs.remove(targetLockFile);
        return;
      }
      this.logger.debug(`moving lock file from ${sourceLockFile} to ${targetDir}`);
      const mvFunc = this.getCapsuleTransferFn();
      try {
        await mvFunc(sourceLockFile, path.join(targetDir, 'pnpm-lock.yaml'));
        this._movedLockFiles.add(sourceLockFile);
      } catch (err) {
        this.logger.error(`failed moving lock file from ${sourceLockFile} to ${targetDir}`, err);
      }
    });
    await Promise.all(promises);
  }

  private async moveCapsulesToTargetDir(
    capsulesDirs: string[],
    sourceRootDir: string,
    targetCapsuleDir: string
  ): Promise<void> {
    this.logger.info(`start moving capsules from ${sourceRootDir} to ${targetCapsuleDir}`);
    const promises = capsulesDirs.map(async (sourceDir) => {
      const dirname = path.basename(sourceDir);
      const sourceCapsuleReadyFile = this.getCapsuleReadyFilePath(sourceDir);
      if (!fs.pathExistsSync(sourceCapsuleReadyFile)) {
        // Capsule is not ready, don't copy it to the cache
        this.logger.console(`skipping moving capsule to cache as it is not ready ${sourceDir}`);
        return;
      }
      const targetDir = path.join(targetCapsuleDir, dirname);
      if (fs.pathExistsSync(path.join(targetCapsuleDir, dirname))) {
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
      await this.moveWithTempName(sourceDir, targetDir, this.getCapsuleTransferFn());
      // Mark the capsule as ready in the new location
      this.writeCapsuleReadyFileSync(targetDir);
    });
    await Promise.all(promises);
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
  private async moveWithTempName(sourceDir, targetDir, mvFunc: Function = fs.move): Promise<void> {
    const tempDir = `${targetDir}-${v4()}`;
    this.logger.console(`moving capsule from ${sourceDir} to a temp dir ${tempDir}`);
    await mvFunc(sourceDir, tempDir);
    const exists = await fs.pathExists(targetDir);
    // This might exist if in the time when we move to the temp dir, another process created the target dir already
    if (exists) {
      this.logger.console(`skip moving capsule from temp dir to real dir as it's already exist: ${targetDir}`);
      // Clean leftovers
      await rimraf(tempDir);
      return;
    }
    this.logger.console(`moving capsule from a temp dir ${tempDir} to the target dir ${targetDir}`);
    await mvFunc(tempDir, targetDir);
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
      this.logger.debug(
        `All required capsules already exists and valid in the real (cached) location: ${realCapsulesDir}`
      );
      return false;
    }
    this.logger.debug(
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
    const useNesting = this.dependencyResolver.isolatedCapsules() && opts.installOptions?.useNesting;
    const installOptions = {
      ...DEFAULT_ISOLATE_INSTALL_OPTIONS,
      ...opts.installOptions,
      useNesting,
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
      longProcessLogger?.end();

      return capsuleList;
    }

    if (opts.skipIfExists) {
      if (!installOptions.useNesting) {
        const existingCapsules = CapsuleList.fromArray(
          capsuleList.filter((capsule) => capsule.fs.existsSync('package.json'))
        );

        if (existingCapsules.length === capsuleList.length) {
          longProcessLogger?.end();
          return existingCapsules;
        }
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
      let installLongProcessLogger: LongProcessLogger | undefined;
      // Only show the log message in case we are going to install something
      if (capsuleList && capsuleList.length && !opts.context?.aspects) {
        installLongProcessLogger = this.logger.createLongProcessLogger(
          `install packages in ${capsuleList.length} capsules`
        );
      }
      const rootLinks = await this.linkInCapsulesRoot(capsulesDir, capsuleList, linkingOptions);
      if (installOptions.useNesting) {
        await Promise.all(
          capsuleList.map(async (capsule, index) => {
            const newCapsuleList = CapsuleList.fromArray([capsule]);
            if (opts.cacheCapsulesDir && capsulesDir !== opts.cacheCapsulesDir && opts.cacheLockFileOnly) {
              const cacheCapsuleDir = path.join(opts.cacheCapsulesDir, basename(capsule.path));
              const lockFilePath = path.join(cacheCapsuleDir, 'pnpm-lock.yaml');
              const lockExists = await fs.pathExists(lockFilePath);
              if (lockExists) {
                try {
                  // this.logger.console(`moving lock file from ${lockFilePath} to ${capsule.path}`);
                  await copyFile(lockFilePath, path.join(capsule.path, 'pnpm-lock.yaml'));
                } catch (err) {
                  // We can ignore the error, we don't want to break the flow. the file will be anyway re-generated
                  // in the target capsule. it will only be a bit slower.
                  this.logger.error(
                    `failed moving lock file from cache folder path: ${lockFilePath} to local capsule at ${capsule.path} (even though the lock file seems to exist)`,
                    err
                  );
                }
              }
            }
            const linkedDependencies = await this.linkInCapsules(newCapsuleList, capsulesWithPackagesData);
            if (index === 0) {
              linkedDependencies[capsulesDir] = rootLinks;
            }
            await this.installInCapsules(capsule.path, newCapsuleList, installOptions, {
              cachePackagesOnCapsulesRoot,
              linkedDependencies,
              packageManager: opts.packageManager,
              nodeLinker: opts.nodeLinker,
            });
          })
        );
      } else {
        let allGraph: DependenciesGraph | undefined;
        if (legacyScope) {
          const componentIds = capsuleList.map((capsule) => capsule.component.id);
          allGraph = await legacyScope.getDependenciesGraphByComponentIds(componentIds);
        }

        const linkedDependencies = await this.linkInCapsules(capsuleList, capsulesWithPackagesData);
        linkedDependencies[capsulesDir] = rootLinks;
        await this.installInCapsules(capsulesDir, capsuleList, installOptions, {
          cachePackagesOnCapsulesRoot,
          linkedDependencies,
          packageManager: opts.packageManager,
          dependenciesGraph: allGraph,
        });
        if (allGraph == null) {
          const components = capsuleList.map(({ component }) => component);
          const componentIdByPkgName = this.dependencyResolver.getComponentIdByPkgNameMap(components);
          await Promise.all(
            capsuleList.map(async (capsule) => {
              capsule.component.state._consumer.dependenciesGraph =
                await this.dependencyResolver.calcDependenciesGraphFromCapsule(
                  path.relative(capsulesDir, capsule.wrkDir),
                  {
                    componentIdByPkgName,
                    workspacePath: capsulesDir,
                  }
                );
            })
          );
        }
      }
      if (installLongProcessLogger) {
        installLongProcessLogger.end('success');
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
    if (longProcessLogger) {
      longProcessLogger.end();
    }
    // Only show this message if at least one new capsule created
    if (longProcessLogger && capsuleList.length) {
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
      nodeLinker?: NodeLinker;
      dependenciesGraph?: DependenciesGraph;
    }
  ) {
    const installer = this.dependencyResolver.getInstaller({
      rootDir: capsulesDir,
      cacheRootDirectory: opts.cachePackagesOnCapsulesRoot ? capsulesDir : undefined,
      installingContext: { inCapsule: true },
      packageManager: opts.packageManager,
      nodeLinker: opts.nodeLinker,
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
      dedupeInjectedDeps: true,
      dependenciesGraph: opts.dependenciesGraph,
    };

    const packageManagerInstallOptions: PackageManagerInstallOptions = {
      autoInstallPeers: this.dependencyResolver.config.autoInstallPeers,
      dedupe: isolateInstallOptions.dedupe,
      copyPeerToRuntimeOnComponents: isolateInstallOptions.copyPeerToRuntimeOnComponents,
      copyPeerToRuntimeOnRoot: isolateInstallOptions.copyPeerToRuntimeOnRoot,
      installPeersFromEnvs: isolateInstallOptions.installPeersFromEnvs,
      nmSelfReferences: this.dependencyResolver.config.capsuleSelfReference,
      overrides: this.dependencyResolver.config.capsulesOverrides || this.dependencyResolver.config.overrides,
      hoistPatterns: this.dependencyResolver.config.hoistPatterns,
      rootComponentsForCapsules: this.dependencyResolver.isolatedCapsules(),
      useNesting: isolateInstallOptions.useNesting,
      keepExistingModulesDir: this.dependencyResolver.isolatedCapsules(),
      hasRootComponents: this.dependencyResolver.isolatedCapsules(),
      hoistWorkspacePackages: true,
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
    capsuleList: CapsuleList,
    capsulesWithPackagesData: CapsulePackageJsonData[]
  ): Promise<Record<string, Record<string, string>>> {
    let nestedLinks: Record<string, Record<string, string>> | undefined;
    if (!this.dependencyResolver.isolatedCapsules()) {
      const capsulesWithModifiedPackageJson = this.getCapsulesWithModifiedPackageJson(capsulesWithPackagesData);
      nestedLinks = await symlinkDependenciesToCapsules(capsulesWithModifiedPackageJson, capsuleList, this.logger);
    }
    return nestedLinks ?? {};
  }

  private async linkInCapsulesRoot(
    capsulesDir: string,
    capsuleList: CapsuleList,
    linkingOptions: LinkingOptions
  ): Promise<Record<string, string>> {
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
    if (!this.dependencyResolver.isolatedCapsules()) {
      rootLinks = await symlinkOnCapsuleRoot(capsuleList, this.logger, capsulesDir);
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
      ...linkedRootDeps,
      ...this.toLocalLinks(rootLinks),
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
    const allIds = ComponentIdList.fromArray(legacyComponents.map((c) => c.id));
    const getParentsComp = () => {
      const artifactsFrom = opts?.populateArtifactsFrom;
      if (!artifactsFrom) return undefined;
      if (!legacyScope) throw new Error('populateArtifactsFrom is set but legacyScope is not defined');
      return Promise.all(artifactsFrom.map((id) => legacyScope.getConsumerComponent(id)));
    };
    const populateArtifactsFromComps = await getParentsComp();
    await Promise.all(
      components.map(async (component) => {
        const capsule = capsuleList.getCapsule(component.id);
        if (!capsule) return;
        const scope =
          (await CapsuleList.capsuleUsePreviouslySavedDists(component)) || opts?.populateArtifactsFrom
            ? legacyScope
            : undefined;
        const dataToPersist = await this.populateComponentsFilesToWriteForCapsule(
          component,
          allIds,
          scope,
          opts,
          populateArtifactsFromComps
        );
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

  registerCapsuleTransferFn(fn: CapsuleTransferFn) {
    this.capsuleTransferSlot.register(fn);
  }

  private getCapsuleTransferFn(): CapsuleTransferFn {
    return this.capsuleTransferSlot.values()[0] || this.getDefaultCapsuleTransferFn();
  }

  private getDefaultCapsuleTransferFn(): CapsuleTransferFn {
    return async (source, target) => {
      return fs.move(source, target, { overwrite: true });
    };
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
      cacheLockFileOnly: false,
      ...getCapsuleDirOpts,
    };
    const capsulesRootBaseDir = getCapsuleDirOptsWithDefaults.rootBaseDir || this.getRootDirOfAllCapsules();
    if (getCapsuleDirOptsWithDefaults.useDatedDirs) {
      const date = new Date();
      const month = date.getMonth() < 12 ? date.getMonth() + 1 : 1;
      const dateDir = `${date.getFullYear()}-${month}-${date.getDate()}`;
      const defaultDatedBaseDir = 'dated-capsules';
      const datedBaseDir = this.globalConfig.getSync(CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR) || defaultDatedBaseDir;
      let hashDir;
      const finalDatedDirId = getCapsuleDirOpts.datedDirId;
      if (finalDatedDirId && this._datedHashForName.has(finalDatedDirId)) {
        // Make sure in the same process we always use the same hash for the same datedDirId
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
      ? hash(getCapsuleDirOptsWithDefaults.baseDir).substring(0, CAPSULE_DIR_LENGTH)
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
    const capsules: Capsule[] = await pMap(
      components,
      (component: Component) => {
        return Capsule.createFromComponent(component, baseDir, opts);
      },
      { concurrency: concurrentComponentsLimit() }
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
    return DEPENDENCIES_FIELDS.some((field) => !isEqual(previousPackageJson[field], currentPackageJson[field]));
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
        peerDependencies: {},
      };
      const compDeps = dependencies.toTypeArray<ComponentDependency>('component');
      const promises = compDeps.map(async (dep) => {
        const depCapsule = capsules.getCapsule(dep.componentId);
        let version = dep.version;
        if (depCapsule) {
          version = getComponentPackageVersion(depCapsule.component);
        } else {
          version = snapToSemver(version);
        }
        const keyName = KEY_NAME_BY_LIFECYCLE_TYPE[dep.lifecycle];
        const entry = dep.toManifest();
        if (entry) {
          manifest[keyName][entry.packageName] = keyName === 'peerDependencies' ? dep.versionRange : version;
        }
      });
      await Promise.all(promises);
      return manifest;
    };
    const deps = this.dependencyResolver.getDependencies(component);
    const manifest = await getComponentDepsManifest(deps);

    // component.packageJsonFile is not available here. we don't mutate the component object for capsules.
    // also, don't use `PackageJsonFile.createFromComponent`, as it looses the intermediate changes
    // such as postInstall scripts for custom-module-resolution.
    const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);

    const addDependencies = (packageJsonFile: PackageJsonFile) => {
      packageJsonFile.addDependencies(manifest.dependencies);
      packageJsonFile.addDevDependencies(manifest.devDependencies);
      packageJsonFile.addPeerDependencies(manifest.peerDependencies);
    };
    addDependencies(packageJson);
    packageJson.addOrUpdateProperty('version', currentVersion);
    return packageJson;
  }

  private async populateComponentsFilesToWriteForCapsule(
    component: Component,
    ids: ComponentIdList,
    legacyScope?: Scope,
    opts?: IsolateComponentsOptions,
    populateArtifactsFromComps?: ConsumerComponent[]
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
    if (populateArtifactsFromComps && !opts?.populateArtifactsIgnorePkgJson) {
      const compParent = this.getCompForArtifacts(component, populateArtifactsFromComps);
      this.mergePkgJsonFromLastBuild(compParent, packageJson);
    }
    dataToPersist.addFile(packageJson.toVinylFile());
    const artifacts = await this.getArtifacts(component, legacyScope, populateArtifactsFromComps);
    dataToPersist.addManyFiles(artifacts);
    return dataToPersist;
  }

  private mergePkgJsonFromLastBuild(component: ConsumerComponent, packageJson: PackageJsonFile) {
    const suffix = `for ${component.id.toString()}. to workaround this, use --ignore-last-pkg-json flag`;
    const aspectsData = component.extensions.findExtension('teambit.pipelines/builder')?.data?.aspectsData;
    if (!aspectsData) throw new Error(`getPkgJsonFromLastBuild, unable to find builder aspects data ${suffix}`);
    const data = aspectsData?.find((aspectData) => aspectData.aspectId === 'teambit.pkg/pkg');
    if (!data) throw new Error(`getPkgJsonFromLastBuild, unable to find pkg aspect data ${suffix}`);
    const pkgJsonLastBuild = data?.data?.pkgJson;
    if (!pkgJsonLastBuild) throw new Error(`getPkgJsonFromLastBuild, unable to find pkgJson of pkg aspect  ${suffix}`);
    const current = packageJson.packageJsonObject;
    pkgJsonLastBuild.componentId = current.componentId;
    pkgJsonLastBuild.version = current.version;
    const mergeDeps = (currentDeps?: Record<string, string>, depsFromLastBuild?: Record<string, string>) => {
      if (!depsFromLastBuild) return;
      if (!currentDeps) return depsFromLastBuild;
      Object.keys(depsFromLastBuild).forEach((depName) => {
        if (!currentDeps[depName]) return;
        depsFromLastBuild[depName] = currentDeps[depName];
      });
      return depsFromLastBuild;
    };
    pkgJsonLastBuild.dependencies = mergeDeps(current.dependencies, pkgJsonLastBuild.dependencies);
    pkgJsonLastBuild.devDependencies = mergeDeps(current.devDependencies, pkgJsonLastBuild.devDependencies);
    pkgJsonLastBuild.peerDependencies = mergeDeps(current.peerDependencies, pkgJsonLastBuild.peerDependencies);
    packageJson.mergePackageJsonObject(pkgJsonLastBuild);
  }

  private getCompForArtifacts(
    component: Component,
    populateArtifactsFromComps: ConsumerComponent[]
  ): ConsumerComponent {
    const compParent = populateArtifactsFromComps.find((comp) =>
      comp.id.isEqual(component.id, { ignoreVersion: true })
    );
    if (!compParent) {
      throw new Error(`isolator, unable to find where to populate the artifacts from for ${component.id.toString()}`);
    }
    return compParent;
  }

  private preparePackageJsonToWrite(
    component: Component,
    bitDir: string,
    ignoreBitDependencies: ComponentIdList | boolean = true
  ): PackageJsonFile {
    const legacyComp: ConsumerComponent = component.state._consumer;
    this.logger.debug(`package-json.preparePackageJsonToWrite. bitDir ${bitDir}.`);
    const getBitDependencies = (dependencies: ComponentIdList) => {
      if (ignoreBitDependencies === true) return {};
      return dependencies.reduce((acc, depId: ComponentID) => {
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
    const packageJson = PackageJsonFile.createFromComponent(bitDir, legacyComp);
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
    populateArtifactsFromComps?: ConsumerComponent[]
  ): Promise<AbstractVinyl[]> {
    const legacyComp: ConsumerComponent = component.state._consumer;
    if (!legacyScope) {
      // when capsules are written via the workspace, do not write artifacts, they get created by
      // build-pipeline. when capsules are written via the scope, we do need the dists.
      return [];
    }
    if (legacyComp.buildStatus !== 'succeed' && !populateArtifactsFromComps) {
      // this is important for "bit sign" when on lane to not go to the original scope
      return [];
    }
    const artifactFilesToFetch = async () => {
      if (populateArtifactsFromComps) {
        const compParent = this.getCompForArtifacts(component, populateArtifactsFromComps);
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
