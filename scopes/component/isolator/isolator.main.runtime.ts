/* eslint-disable max-lines */
import rimraf from 'rimraf';
import { v4 } from 'uuid';
import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import semver from 'semver';
import chalk from 'chalk';
import { compact, flatten, isEqual, pick } from 'lodash';
import {
  isFeatureEnabled,
  DISABLE_CAPSULE_OPTIMIZATION,
  CAPSULE_AUTO_PRUNE,
} from '@teambit/harmony.modules.feature-toggle';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import { ComponentMap, ComponentAspect } from '@teambit/component';
import type { ComponentMain, ComponentFactory, Component } from '@teambit/component';
import { getComponentPackageVersion, snapToSemver } from '@teambit/component-package-version';
import { createLinks } from '@teambit/dependencies.fs.linked-dependencies';
import type { GraphMain } from '@teambit/graph';
import { GraphAspect } from '@teambit/graph';
import type { SlotRegistry } from '@teambit/harmony';
import { Slot } from '@teambit/harmony';
import type {
  DependencyResolverMain,
  LinkingOptions,
  LinkDetail,
  WorkspacePolicy,
  InstallOptions,
  DependencyList,
  ComponentDependency,
  PackageManagerInstallOptions,
  NodeLinker,
} from '@teambit/dependency-resolver';
import { DependencyResolverAspect, KEY_NAME_BY_LIFECYCLE_TYPE } from '@teambit/dependency-resolver';
import type { Logger, LoggerMain, LongProcessLogger } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import type { Scope, Scope as LegacyScope } from '@teambit/legacy.scope';
import type { GlobalConfigMain } from '@teambit/global-config';
import { GlobalConfigAspect } from '@teambit/global-config';
import {
  DEPENDENCIES_FIELDS,
  PACKAGE_JSON,
  CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR,
  CFG_CAPSULES_MAX_SIZE_GB,
  CFG_CAPSULES_MAX_AGE_DAYS,
  CFG_CAPSULES_AUTO_PRUNE,
} from '@teambit/legacy.constants';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import type { AbstractVinyl, ArtifactVinyl } from '@teambit/component.sources';
import {
  PackageJsonFile,
  ArtifactFiles,
  deserializeArtifactFiles,
  getArtifactFilesByExtension,
  getArtifactFilesExcludeExtension,
  importMultipleDistsArtifacts,
  DataToPersist,
  RemovePath,
} from '@teambit/component.sources';
import type { PathOsBasedAbsolute } from '@teambit/legacy.utils';
import { pathNormalizeToLinux } from '@teambit/legacy.utils';
import { concurrentComponentsLimit, concurrentIOLimit } from '@teambit/harmony.modules.concurrency';
import { componentIdToPackageName } from '@teambit/pkg.modules.component-package-name';
import { type DependenciesGraph } from '@teambit/objects';

import fs, { copyFile } from 'fs-extra';
import hash from 'object-hash';
import path, { basename } from 'path';
import { spawn } from 'child_process';
import { PackageJsonTransformer } from '@teambit/workspace.modules.node-modules-linker';
import pMap from 'p-map';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import { IsolatorAspect } from './isolator.aspect';
import { symlinkOnCapsuleRoot, symlinkDependenciesToCapsules } from './symlink-dependencies-to-capsules';
import { Network } from './network';
import type { ConfigStoreMain } from '@teambit/config-store';
import { ConfigStoreAspect } from '@teambit/config-store';

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

  /**
   * Generate a lockfile from the dependencies graph stored in the model
   * and generate a dependency graph from the lockfile in the capsule.
   */
  useDependenciesGraph?: boolean;
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

/**
 * Marker file written into every capsule dir we manage. Its presence tells the prune logic
 * what kind of dir this is, where it came from, and (via its mtime) when it was last used.
 */
export const CAPSULE_ORIGIN_FILE = '.bit-capsule-origin.json';
export const CAPSULE_TRASH_DIR = '.trash';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export type CapsuleKind = 'workspace' | 'scope-aspects-root' | 'scope-aspect' | 'scope';

const VALID_CAPSULE_KINDS: ReadonlySet<string> = new Set(['workspace', 'scope-aspects-root', 'scope-aspect', 'scope']);

export type CapsuleOriginMarker = {
  originPath: string;
  createdAt: string;
  kind: CapsuleKind;
};

export type PruneCapsulesOptions = {
  olderThanDays?: number;
  includeOrphans?: boolean;
  keepWorkspaceCaps?: boolean;
  sizeTargetGb?: number;
  dryRun?: boolean;
  /**
   * Compute byte sizes for every entry being considered. When false, all `sizeBytes`
   * in the report are 0 and the cache walk skips the expensive recursive `lstat` pass —
   * deletion (rename-to-trash) is O(1) and runs in milliseconds even on multi-GB caches.
   * Forced on when `sizeTargetGb` is set because that path needs sizes to enforce.
   */
  withSizes?: boolean;
};

export type PruneCapsulesReport = {
  /** `originPath` is the workspace/scope a capsule was created for (from its marker), when known. */
  removed: { path: string; kind: CapsuleKind | 'unmarked'; reason: string; sizeBytes: number; originPath?: string }[];
  totalRemovedBytes: number;
  totalSizeBeforeBytes: number;
  totalSizeAfterBytes: number;
  dryRun: boolean;
};

function toFiniteNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

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
    ConfigStoreAspect,
  ];
  static slots = [Slot.withType<CapsuleTransferFn>()];
  static defaultConfig = {};
  _componentsPackagesVersionCache: { [idStr: string]: string } = {}; // cache packages versions of components
  _datedHashForName = new Map<string, string>(); // cache dated hash for a specific name
  _movedLockFiles = new Set(); // cache moved lock files to avoid show warning about them

  static async provider(
    [dependencyResolver, loggerExtension, componentAspect, graphMain, globalConfig, aspectLoader, cli, configStore]: [
      DependencyResolverMain,
      LoggerMain,
      ComponentMain,
      GraphMain,
      GlobalConfigMain,
      AspectLoaderMain,
      CLIMain,
      ConfigStoreMain,
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
      capsuleTransferSlot,
      configStore
    );
    isolator.registerAutoPruneHook();
    isolator.sweepTrashAsync();
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
    private capsuleTransferSlot: CapsuleTransferSlot,
    private configStore: ConfigStoreMain
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
    const componentsToInclude = compact(existingCompsIds);
    let filteredComps = await host.getMany(componentsToInclude);

    // Optimization: exclude unmodified exported dependencies from capsule creation
    if (!isFeatureEnabled(DISABLE_CAPSULE_OPTIMIZATION)) {
      filteredComps = await this.filterUnmodifiedExportedDependencies(filteredComps, seeders, host);
      this.logger.debug(
        `[OPTIMIZATION] Before filtering: ${componentsToInclude.length}. After filtering: ${filteredComps.length} components remaining`
      );
    }

    return filteredComps;
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
  /* eslint-disable complexity */
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
    if (opts.getExistingAsIs && !(await fs.pathExists(capsulesDir))) {
      this.logger.console(
        `💡 Capsules directory not found: ${capsulesDir}. Automatically setting getExistingAsIs to false.`
      );
      opts.getExistingAsIs = false;
    }
    if (opts.emptyRootDir) {
      await fs.emptyDir(capsulesDir);
    }
    let capsules = await this.createCapsulesFromComponents(components, capsulesDir, config);
    this.writeRootPackageJson(capsulesDir, this.getCapsuleDirHash(opts.baseDir || ''));
    const rootKind = this.deriveCapsuleKind(opts);
    const rootOriginPath = opts.baseDir || '';
    await this.ensureOriginMarker(capsulesDir, rootKind, rootOriginPath);
    const allCapsuleList = CapsuleList.fromArray(capsules);
    let capsuleList = allCapsuleList;
    if (opts.getExistingAsIs) {
      if (rootKind === 'scope-aspects-root') {
        await this.ensureAspectCapsuleMarkers(allCapsuleList, rootOriginPath);
      }
      longProcessLogger?.end();

      return capsuleList;
    }

    if (opts.skipIfExists) {
      if (!installOptions.useNesting) {
        const existingCapsules = CapsuleList.fromArray(
          capsuleList.filter((capsule) => capsule.fs.existsSync('package.json'))
        );

        if (existingCapsules.length === capsuleList.length) {
          if (rootKind === 'scope-aspects-root') {
            await this.ensureAspectCapsuleMarkers(existingCapsules, rootOriginPath);
          }
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
        const dependenciesGraph = opts.useDependenciesGraph
          ? await legacyScope?.getDependenciesGraphByComponentIds(capsuleList.getAllComponentIDs())
          : undefined;
        const linkedDependencies = await this.linkInCapsules(capsuleList, capsulesWithPackagesData);
        linkedDependencies[capsulesDir] = rootLinks;
        await this.installInCapsules(capsulesDir, capsuleList, installOptions, {
          cachePackagesOnCapsulesRoot,
          linkedDependencies,
          packageManager: opts.packageManager,
          dependenciesGraph,
        });
        if (opts.useDependenciesGraph && dependenciesGraph == null) {
          // If the graph was not present in the model, we use the just created lockfile inside the capsules
          // to populate the graph.
          await this.addDependenciesGraphToComponents(capsuleList, components, capsulesDir);
        }
      }
      if (installLongProcessLogger) {
        installLongProcessLogger.end('success');
      }
    }

    // rewrite the package-json with the component dependencies in it. the original package.json
    // that was written before, didn't have these dependencies in order for the package-manager to
    // be able to install them without crashing when the versions don't exist yet.
    // skip this rewrite when populateArtifactsFrom is set, because the package.json was already
    // written with the correct (merged) dependencies from the last build in writeComponentsInCapsules.
    if (!opts.populateArtifactsFrom) {
      capsulesWithPackagesData.forEach((capsuleWithPackageData) => {
        const { currentPackageJson, capsule } = capsuleWithPackageData;
        if (!currentPackageJson)
          throw new Error(
            `isolator.createCapsules, unable to find currentPackageJson for ${capsule.component.id.toString()}`
          );
        capsuleWithPackageData.capsule.fs.writeFileSync(PACKAGE_JSON, JSON.stringify(currentPackageJson, null, 2));
      });
    }
    await this.markCapsulesAsReady(capsuleList);
    if (rootKind === 'scope-aspects-root') {
      await this.ensureAspectCapsuleMarkers(allCapsuleList, rootOriginPath);
    }
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
  /* eslint-enable complexity */

  private async addDependenciesGraphToComponents(
    capsuleList: CapsuleList,
    components: Component[],
    capsulesDir: string
  ): Promise<void> {
    const componentIdByPkgName = this.dependencyResolver.createComponentIdByPkgNameMap(components);
    const opts = {
      componentIdByPkgName,
      rootDir: capsulesDir,
    };
    const comps = capsuleList.map((capsule) => ({
      component: capsule.component,
      componentRelativeDir: path.relative(capsulesDir, capsule.path),
    }));
    await this.dependencyResolver.addDependenciesGraph(comps, opts);
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
      forcedHarmonyVersion: this.dependencyResolver.harmonyVersionInRootPolicy(),
      excludeExtensionsDependencies: true,
      dedupeInjectedDeps: true,
      dependenciesGraph: opts.dependenciesGraph,
    };

    const packageManagerInstallOptions: PackageManagerInstallOptions = {
      autoInstallPeers: this.dependencyResolver.config.autoInstallPeers,
      dedupePeers: this.dependencyResolver.config.dedupePeers,
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

  /**
   * TODO: The modified/unmodified separation and `importMultipleDistsArtifacts` optimization below
   * is likely ineffective and could be removed. See TODO comment on `CapsuleList.capsuleUsePreviouslySavedDists`
   * for details. The optimization downloads dist artifacts for unmodified components, but TypeScript
   * will recompile them anyway because `tsconfig.tsbuildinfo` is not saved in objects.
   */
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

  private getCapsuleDirHash(baseDir: string): string {
    return hash(baseDir).substring(0, CAPSULE_DIR_LENGTH);
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
      const dateDir = this.getDatedCapsuleDirName();
      const defaultDatedBaseDir = 'dated-capsules';
      const datedBaseDir = this.configStore.getConfig(CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR) || defaultDatedBaseDir;
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
      ? this.getCapsuleDirHash(getCapsuleDirOptsWithDefaults.baseDir)
      : getCapsuleDirOptsWithDefaults.baseDir;
    return path.join(capsulesRootBaseDir, dir);
  }

  async deleteCapsules(rootDir?: string): Promise<string> {
    const dirToDelete = rootDir || this.getRootDirOfAllCapsules();
    const marker = await this.readOriginMarker(dirToDelete);
    this.logger.debug(
      `[capsule-delete] removing ${dirToDelete}` + (marker?.originPath ? ` origin=${marker.originPath}` : '')
    );
    await this.scheduleFastDelete(dirToDelete);
    return dirToDelete;
  }

  /**
   * Move a capsule dir into a sibling `.trash/<uuid>/` so it disappears from the cache
   * immediately (same-filesystem rename is O(1)), then kick off a detached `rm -rf` so the
   * actual byte-by-byte cleanup happens in the background. This avoids the multi-second
   * stalls users see when deleting capsules with thousands of files.
   */
  async scheduleFastDelete(dir: string): Promise<void> {
    const exists = await fs.pathExists(dir);
    if (!exists) return;
    const globalRoot = this.getRootDirOfAllCapsules();
    // Edge case: deleting the global root itself. We can't move a dir into its own
    // child (`.trash/...`), so just do a direct remove. This is rare — only `bit
    // capsule delete --all` hits it.
    if (path.resolve(dir) === path.resolve(globalRoot)) {
      await fs.remove(dir);
      return;
    }
    const trashRoot = path.join(globalRoot, CAPSULE_TRASH_DIR);
    await fs.ensureDir(trashRoot);
    const trashTarget = path.join(trashRoot, `${path.basename(dir)}-${v4()}`);
    try {
      await fs.move(dir, trashTarget, { overwrite: true });
    } catch (err: any) {
      // Likely cross-device — fall back to a synchronous remove.
      this.logger.debug(`scheduleFastDelete: rename failed for ${dir}, falling back to fs.remove (${err.message})`);
      await fs.remove(dir);
      return;
    }
    // Run through the gated sweepTrashAsync path so we never have more than one sweep
    // running concurrently — even if many bit processes are moving things to trash.
    this.sweepTrashAsync();
  }

  /**
   * Sweep the `.trash` dir in a detached background process. Gated by a PID-stamped
   * lock so we never have more than one sweep running at a time across all concurrent
   * bit processes — previously we spawned one per `bit` invocation and they piled up
   * into the thousands, saturating disk I/O.
   */
  sweepTrashAsync(): void {
    const trashRoot = path.join(this.getRootDirOfAllCapsules(), CAPSULE_TRASH_DIR);
    // No trash → nothing to do. Cheap synchronous check avoids spawning a process at all.
    if (!fs.existsSync(trashRoot)) return;
    const lockPath = path.join(this.getRootDirOfAllCapsules(), '.trash-sweep.lock');
    if (this.isSweepLockActive(lockPath)) {
      this.logger.debug(`trash sweep already running (per ${lockPath}), skipping`);
      return;
    }
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: 'w' });
    } catch (err: any) {
      this.logger.debug(`failed to write sweep lock at ${lockPath}: ${err.message}`);
      return;
    }
    this.spawnDetachedSweep(trashRoot, lockPath);
  }

  /**
   * A sweep lock is "active" if the PID it names is still running. If the PID file
   * exists but the process is gone (e.g. crashed mid-sweep), we treat it as stale and
   * allow a new sweep to claim it.
   */
  private isSweepLockActive(lockPath: string): boolean {
    let pidStr: string;
    try {
      pidStr = fs.readFileSync(lockPath, 'utf8').trim();
    } catch {
      return false;
    }
    const pid = Number(pidStr);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
      // Signal 0 = "is this PID alive?" — no actual signal sent.
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Register a process-exit hook that, at most once per ~24h, spawns a detached
   * `bit capsule prune` child so the actual work runs out-of-process and never delays
   * the parent's exit. Gated by the mtime of a stamp file under the capsules root so
   * concurrent Bit invocations can't all trigger it at once, and behind the
   * `capsule-auto-prune` feature flag while the behavior is being validated.
   */
  registerAutoPruneHook(): void {
    this.cli.registerOnBeforeExit(async () => {
      try {
        await this.maybeAutoPrune();
      } catch (err: any) {
        this.logger.debug(`auto-prune skipped due to error: ${err?.message ?? err}`);
      }
    });
  }

  private async maybeAutoPrune(): Promise<void> {
    // Experimental: the automatic prune only runs for users who opt in via the feature flag
    // (`BIT_FEATURES=capsule-auto-prune` or `bit config set features=capsule-auto-prune`).
    // Until it's promoted to GA, the default behavior is unchanged — capsules are never
    // auto-deleted. The manual `bit capsule prune` command is always available regardless.
    if (!isFeatureEnabled(CAPSULE_AUTO_PRUNE)) return;

    // configStore may surface this as either string `'false'` (from `bit config set`)
    // or boolean `false` (from a hand-edited JSON config) — accept both. This is a
    // secondary escape hatch for once the feature is GA and the flag is removed.
    const enabled = this.configStore.getConfig(CFG_CAPSULES_AUTO_PRUNE);
    if (enabled === 'false' || (enabled as unknown) === false) return;

    const root = this.getRootDirOfAllCapsules();
    if (!(await fs.pathExists(root))) return;

    const stampPath = path.join(root, '.last-capsule-prune');
    const isStampFresh = async (): Promise<boolean> => {
      try {
        const stat = await fs.stat(stampPath);
        return Date.now() - stat.mtime.getTime() < ONE_DAY_MS;
      } catch {
        return false; // missing — needs a prune
      }
    };
    // Fast path: stamp is recent, nothing to do (no contention here).
    if (await isStampFresh()) return;

    // Atomic claim: only one process across all concurrent bit invocations may win the
    // daily slot. `wx` is O_CREAT|O_EXCL — it throws if the lock already exists, so the
    // check-and-write below can't race. The lock is held only for the few ms it takes to
    // re-check the stamp and spawn the detached child, then removed in `finally`.
    const claimPath = `${stampPath}.claim`;
    let claimed = false;
    try {
      await fs.close(await fs.open(claimPath, 'wx'));
      claimed = true;
    } catch {
      // Another process is mid-claim, or a previous run leaked the lock. If it's stale
      // (older than the daily window), reclaim it by removing + re-opening with O_EXCL —
      // if two processes race the reclaim, only one's `wx` open succeeds and the other
      // yields. Otherwise yield.
      try {
        const claimStat = await fs.stat(claimPath);
        if (Date.now() - claimStat.mtime.getTime() < ONE_DAY_MS) return;
        await fs.remove(claimPath);
        await fs.close(await fs.open(claimPath, 'wx'));
        claimed = true;
      } catch {
        return;
      }
    }
    try {
      // Re-check under the lock: a process that just held it may have refreshed the stamp.
      if (await isStampFresh()) return;
      await fs.outputFile(stampPath, '');

      // Guard against non-numeric/empty config (NaN) and negative values (which would
      // invert the age cutoff / size target and wipe the whole cache).
      const olderThanDays = Math.max(0, toFiniteNumber(this.configStore.getConfig(CFG_CAPSULES_MAX_AGE_DAYS)) ?? 30);
      const sizeTargetGb = Math.max(0, toFiniteNumber(this.configStore.getConfig(CFG_CAPSULES_MAX_SIZE_GB)) ?? 10);

      this.logger.debug(
        `[auto-prune] spawning detached child. olderThanDays=${olderThanDays}, sizeTargetGb=${sizeTargetGb}`
      );
      this.spawnDetachedAutoPrune(olderThanDays, sizeTargetGb);
    } finally {
      if (claimed) {
        try {
          await fs.remove(claimPath);
        } catch {
          // ignore — a stale claim lock is reclaimed by the age check above
        }
      }
    }
  }

  /**
   * Fire-and-forget: spawn a detached child running `bit capsule prune`. Using the same
   * bit binary that's currently running (via process.argv[0] + argv[1]) so we don't depend
   * on PATH. stdio is ignored so nothing leaks to the user's terminal.
   *
   * Recursion guard: the child also runs onBeforeExit → maybeAutoPrune, but it reads the
   * stamp file that we just wrote and bails out before re-spawning.
   */
  private spawnDetachedAutoPrune(olderThanDays: number, sizeTargetGb: number): void {
    const bitEntry = process.argv[1];
    if (!bitEntry) {
      this.logger.debug('[auto-prune] cannot detach: process.argv[1] is empty');
      return;
    }
    try {
      const child = spawn(
        process.execPath,
        [bitEntry, 'capsule', 'prune', '--older-than', String(olderThanDays), '--size-target', String(sizeTargetGb)],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        }
      );
      child.unref();
    } catch (err: any) {
      this.logger.debug(`[auto-prune] failed to spawn detached child: ${err.message}`);
    }
  }

  /**
   * Spawn one detached Node process that recursively removes `trashRoot`. Using
   * `process.execPath` with an inline `fs.rmSync` keeps this portable across macOS,
   * Linux, and Windows (where there's no `rm` binary). When `lockPath` is given, the
   * child clears the lock on exit so the next bit invocation can claim a fresh sweep slot.
   */
  private spawnDetachedSweep(trashRoot: string, lockPath?: string): void {
    const script = lockPath
      ? `try { require('fs').rmSync(${JSON.stringify(trashRoot)}, { recursive: true, force: true }); } finally { try { require('fs').rmSync(${JSON.stringify(lockPath)}, { force: true }); } catch (_) {} }`
      : `require('fs').rmSync(${JSON.stringify(trashRoot)}, { recursive: true, force: true })`;
    try {
      const child = spawn(process.execPath, ['-e', script], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch (err: any) {
      this.logger.debug(`failed to spawn detached trash sweep: ${err.message}`);
      // Don't leak the lock if the spawn itself failed. Use fs-extra's removeSync
      // (rmSync isn't in the @types/fs-extra version pinned by this component).
      if (lockPath) {
        try {
          fs.removeSync(lockPath);
        } catch {
          // ignore
        }
      }
    }
  }

  private writeRootPackageJson(capsulesDir: string, hashDir: string): void {
    const rootPackageJson = path.join(capsulesDir, 'package.json');
    if (!fs.existsSync(rootPackageJson)) {
      const packageJson = {
        name: `capsules-${hashDir}`,
        'bit-capsule': true,
      };
      fs.outputJsonSync(rootPackageJson, packageJson);
    }
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

  /**
   * Derive the capsule kind from the isolation context. Aspect resolution sets
   * `opts.context.aspects = true`. Otherwise, distinguish bare-scope isolations
   * (host is ScopeMain) from workspace isolations (host is Workspace) by duck-typing
   * on `bitMap`, which only Workspace exposes — this avoids a circular dep on the
   * workspace aspect.
   */
  private deriveCapsuleKind(opts: IsolateComponentsOptions): CapsuleKind {
    if (opts.context?.aspects) return 'scope-aspects-root';
    const host = opts.host || this.componentAspect.getHost();
    if (host && !('bitMap' in host)) return 'scope';
    return 'workspace';
  }

  /**
   * Write the origin marker if missing; otherwise just bump its mtime so it reflects
   * "last used at". Failures are non-fatal — markers are best-effort metadata.
   */
  private async ensureOriginMarker(dir: string, kind: CapsuleKind, originPath: string): Promise<void> {
    const markerPath = path.join(dir, CAPSULE_ORIGIN_FILE);
    try {
      if (await fs.pathExists(markerPath)) {
        const now = new Date();
        await fs.utimes(markerPath, now, now);
        return;
      }
      const marker: CapsuleOriginMarker = {
        originPath,
        createdAt: new Date().toISOString(),
        kind,
      };
      await fs.outputJson(markerPath, marker);
    } catch (err: any) {
      this.logger.debug(`failed to write capsule origin marker at ${markerPath}: ${err.message}`);
    }
  }

  /**
   * Single source of truth for the dated-capsules date-dir name (`YYYY-M-D`, no zero-pad).
   * Used by `getCapsulesRootDir` when writing and `pruneDatedCapsulesChildren` when reading,
   * so the two can never drift.
   */
  private getDatedCapsuleDirName(date: Date = new Date()): string {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  /**
   * Standard filter for "real" capsule subdirs we may walk or prune. Skips files, the trash
   * dir (dot-prefixed), `node_modules`, and any other hidden/internal dir.
   */
  private isPrunableSubdir(entry: fs.Dirent): boolean {
    return entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.');
  }

  /**
   * Combined marker read + last-used resolution for a capsule dir: one `readJson`, one
   * fallback `stat`. Replaces the three-syscall (`readMarker` + `getOriginMarkerMtime` +
   * dir `stat`) idiom that was copy-pasted across the prune walks.
   */
  private async readMarkerInfo(dir: string): Promise<{ marker?: CapsuleOriginMarker; lastUsedMs: number }> {
    const marker = await this.readOriginMarker(dir);
    if (marker) {
      const mtime = await this.getOriginMarkerMtime(dir);
      if (mtime) return { marker, lastUsedMs: mtime.getTime() };
    }
    const stat = await fs.stat(dir).catch(() => undefined);
    return { marker, lastUsedMs: (stat?.mtime ?? new Date(0)).getTime() };
  }

  private async readOriginMarker(dir: string): Promise<CapsuleOriginMarker | undefined> {
    try {
      const raw = await fs.readJson(path.join(dir, CAPSULE_ORIGIN_FILE));
      if (
        raw &&
        typeof raw.originPath === 'string' &&
        // Reject unknown kinds (corrupted markers or values from a future Bit) so they
        // fall through to the 'unmarked' path in pruneCapsules rather than silently
        // skipping deletion.
        VALID_CAPSULE_KINDS.has(raw.kind)
      ) {
        return raw as CapsuleOriginMarker;
      }
    } catch {
      // missing or malformed — treat as unmarked
    }
    return undefined;
  }

  private async getOriginMarkerMtime(dir: string): Promise<Date | undefined> {
    try {
      const stat = await fs.stat(path.join(dir, CAPSULE_ORIGIN_FILE));
      return stat.mtime;
    } catch {
      return undefined;
    }
  }

  /**
   * Mark all per-component capsule subdirs as scope-aspect kind, originated from the
   * scope-aspects root. Used right after a scope-aspects isolation.
   */
  private async ensureAspectCapsuleMarkers(capsuleList: CapsuleList, rootOriginPath: string): Promise<void> {
    await Promise.all(
      capsuleList.map(async (capsule) => {
        if (!fs.existsSync(capsule.path)) return;
        await this.ensureOriginMarker(capsule.path, 'scope-aspect', rootOriginPath);
      })
    );
  }

  /**
   * Walk the global capsules root and return entries with their classification, size, and
   * last-used time. Used by prune and by `bit capsule list`.
   */
  async listAllCapsuleRoots(opts: { withSizes?: boolean } = {}): Promise<
    Array<{
      path: string;
      kind: CapsuleKind | 'unmarked';
      originPath?: string;
      lastUsedMs: number;
      sizeBytes: number;
    }>
  > {
    const withSizes = opts.withSizes !== false;
    const root = this.getRootDirOfAllCapsules();
    if (!(await fs.pathExists(root))) return [];
    const entries = await fs.readdir(root, { withFileTypes: true });
    const subdirs = entries.filter((e) => this.isPrunableSubdir(e));
    // Bounded concurrency: on a multi-GB cache with hundreds of subdirs and tens of
    // thousands of files per subdir, an unbounded Promise.all of recursive size walks
    // can hit OS file-descriptor limits (EMFILE) and thrash disk.
    return pMap(
      subdirs,
      async (entry) => {
        const subPath = path.join(root, entry.name);
        const { marker, lastUsedMs } = await this.readMarkerInfo(subPath);
        const sizeBytes = withSizes ? await this.computeDirSize(subPath) : 0;
        return {
          path: subPath,
          kind: (marker?.kind ?? 'unmarked') as CapsuleKind | 'unmarked',
          originPath: marker?.originPath,
          lastUsedMs,
          sizeBytes,
        };
      },
      { concurrency: concurrentIOLimit() }
    );
  }

  /**
   * Sum sizes of all entries under `dir`. Tolerant of symlinks and permission errors —
   * any failure returns the partial sum so we never throw from the prune path.
   * Uses bounded concurrency to avoid EMFILE on deep trees.
   */
  async computeDirSize(dir: string): Promise<number> {
    let total = 0;
    const concurrency = concurrentIOLimit();
    const walk = async (current: string) => {
      let entries: fs.Dirent[];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      await pMap(
        entries,
        async (entry) => {
          const p = path.join(current, entry.name);
          if (entry.isDirectory()) {
            await walk(p);
          } else if (entry.isFile()) {
            try {
              const st = await fs.lstat(p);
              total += st.size;
            } catch {
              // ignore
            }
          }
        },
        { concurrency }
      );
    };
    await walk(dir);
    return total;
  }

  /**
   * Apply the prune rules from the plan:
   *   - workspace caps: deleted unconditionally (unless keepWorkspaceCaps)
   *   - scope-aspects-root: never deleted as a whole; per-aspect-version children pruned by age
   *   - scope caps and unmarked dirs older than threshold: deleted
   *   - orphans (marker says originPath gone): deleted
   *   - after the above, if sizeTargetGb given and size still exceeds it, evict oldest-first
   */
  async pruneCapsules(opts: PruneCapsulesOptions = {}): Promise<PruneCapsulesReport> {
    // Clamp to >= 0: a negative age would put the cutoff in the future (everything looks
    // "too old" → whole cache deleted); a negative size target would force evicting
    // everything. Both are almost certainly user error, so floor them at 0.
    const olderThanDays = Math.max(0, opts.olderThanDays ?? 30);
    const sizeTargetGb = opts.sizeTargetGb === undefined ? undefined : Math.max(0, opts.sizeTargetGb);
    const includeOrphans = opts.includeOrphans !== false;
    const keepWorkspaceCaps = opts.keepWorkspaceCaps === true;
    const dryRun = opts.dryRun === true;
    // Size accounting requires an expensive recursive lstat across the whole cache. Skip
    // it by default so the foreground command returns in ms (deletes are O(1) renames);
    // force on for size-target enforcement and when the caller asks for byte accounting.
    const computeSizes = opts.withSizes === true || sizeTargetGb !== undefined;
    const ageCutoffMs = Date.now() - olderThanDays * ONE_DAY_MS;
    const datedDirName = this.configStore.getConfig(CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR) || 'dated-capsules';

    const roots = await this.listAllCapsuleRoots({ withSizes: computeSizes });
    const totalSizeBefore = computeSizes ? roots.reduce((sum, r) => sum + r.sizeBytes, 0) : 0;
    const removed: PruneCapsulesReport['removed'] = [];

    const removeEntry = (
      p: string,
      kind: CapsuleKind | 'unmarked',
      reason: string,
      sizeBytes: number,
      originPath?: string
    ) => this.recordRemoval(removed, { path: p, kind, reason, sizeBytes, originPath }, dryRun);

    for (const root of roots) {
      if (path.basename(root.path) === datedDirName) {
        await this.pruneDatedCapsulesChildren(root.path, dryRun, computeSizes, removed);
        continue;
      }
      if (root.kind === 'workspace') {
        if (keepWorkspaceCaps) continue;
        await removeEntry(root.path, root.kind, 'workspace-cap', root.sizeBytes, root.originPath);
        continue;
      }
      if (root.kind === 'scope' || root.kind === 'unmarked') {
        const orphan = includeOrphans && root.originPath && !(await fs.pathExists(root.originPath));
        const tooOld = root.lastUsedMs < ageCutoffMs;
        if (orphan) {
          await removeEntry(root.path, root.kind, 'orphan', root.sizeBytes, root.originPath);
        } else if (tooOld) {
          // For unmarked dirs, sniff content first to avoid nuking a legacy scope-aspects root.
          if (root.kind === 'unmarked' && (await this.looksLikeAspectsRoot(root.path))) {
            await this.pruneAspectsRootChildren(root.path, ageCutoffMs, dryRun, computeSizes, removed);
          } else {
            await removeEntry(root.path, root.kind, `older-than-${olderThanDays}d`, root.sizeBytes, root.originPath);
          }
        }
        continue;
      }
      if (root.kind === 'scope-aspects-root') {
        await this.pruneAspectsRootChildren(root.path, ageCutoffMs, dryRun, computeSizes, removed);
        continue;
      }
    }

    if (sizeTargetGb !== undefined) {
      await this.applySizeTarget(sizeTargetGb, removed, dryRun);
    }

    const totalRemovedBytes = removed.reduce((sum, r) => sum + r.sizeBytes, 0);
    // For dry-run, report the *projected* post-prune size so the CLI summary stays
    // internally consistent (cache: X → X − freed). Real prune subtracts the same.
    const totalSizeAfter = Math.max(0, totalSizeBefore - totalRemovedBytes);

    return {
      removed,
      totalRemovedBytes,
      totalSizeBeforeBytes: totalSizeBefore,
      totalSizeAfterBytes: totalSizeAfter,
      dryRun,
    };
  }

  /**
   * Record a removal in the prune report and, unless this is a dry run, actually delete it
   * (fast rename-to-trash). Keeps the "report and delete are gated by the same dryRun flag"
   * invariant in one place so the per-kind prune helpers can't drift apart.
   */
  private async recordRemoval(
    removed: PruneCapsulesReport['removed'],
    entry: PruneCapsulesReport['removed'][number],
    dryRun: boolean
  ): Promise<void> {
    removed.push(entry);
    this.logger.debug(
      `[capsule-prune] ${dryRun ? 'would remove' : 'removing'} [${entry.kind} · ${entry.reason}] ${entry.path}` +
        (entry.originPath ? ` origin=${entry.originPath}` : '')
    );
    if (!dryRun) await this.scheduleFastDelete(entry.path);
  }

  /**
   * The `dated-capsules` dir holds per-date subdirs (`YYYY-M-D`) of in-flight isolation
   * runs. These are recreated on every isolation, so anything that isn't *today*'s
   * subdir is leftover from a previous run and safe to delete. Today's subdir is
   * preserved to avoid racing a concurrent bit process that may still be writing to it.
   */
  private async pruneDatedCapsulesChildren(
    rootPath: string,
    dryRun: boolean,
    computeSizes: boolean,
    removed: PruneCapsulesReport['removed']
  ): Promise<void> {
    const todayDir = this.getDatedCapsuleDirName();
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(rootPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!this.isPrunableSubdir(entry)) continue;
      if (entry.name === todayDir) continue;
      const childPath = path.join(rootPath, entry.name);
      const sizeBytes = computeSizes ? await this.computeDirSize(childPath) : 0;
      await this.recordRemoval(
        removed,
        { path: childPath, kind: 'unmarked', reason: 'dated-capsules-not-today', sizeBytes },
        dryRun
      );
    }
  }

  /**
   * Legacy unmarked dirs may still be a scope-aspects root. Heuristic: a child subdir whose
   * name contains `@` (aspect-version pattern like `teambit.node_node@1.3.4`).
   */
  private async looksLikeAspectsRoot(dir: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.some((e) => e.isDirectory() && e.name.includes('@'));
    } catch {
      return false;
    }
  }

  /**
   * Prune per-aspect-version children of a scope-aspects root purely by age (marker mtime,
   * which is touched on every aspect load).
   *
   * Note there's deliberately no orphan check here: a scope-aspect child's `originPath` is
   * the *logical* scope-aspects path (e.g. `<scope.path>-aspects`) used only to hash the
   * capsule root dir name — it need not exist as a real directory, so treating a missing
   * `originPath` as "orphan" would wrongly delete capsules of currently-used aspects.
   * Orphan pruning is still honored elsewhere for `workspace`/`scope` kinds.
   */
  private async pruneAspectsRootChildren(
    rootPath: string,
    ageCutoffMs: number,
    dryRun: boolean,
    computeSizes: boolean,
    removed: PruneCapsulesReport['removed']
  ): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.readdir(rootPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!this.isPrunableSubdir(entry)) continue;
      const childPath = path.join(rootPath, entry.name);
      const { marker, lastUsedMs } = await this.readMarkerInfo(childPath);
      if (lastUsedMs < ageCutoffMs) {
        const sizeBytes = computeSizes ? await this.computeDirSize(childPath) : 0;
        await this.recordRemoval(
          removed,
          {
            path: childPath,
            kind: 'scope-aspect',
            reason: 'aspect-older-than-cutoff',
            sizeBytes,
            originPath: marker?.originPath,
          },
          dryRun
        );
      }
    }
  }

  /**
   * After the standard prune, if total still exceeds the target, keep evicting the
   * oldest remaining aspect-version subdirs until under the limit.
   */
  private async applySizeTarget(
    sizeTargetGb: number,
    removed: PruneCapsulesReport['removed'],
    dryRun: boolean
  ): Promise<void> {
    const targetBytes = sizeTargetGb * 1024 * 1024 * 1024;
    const removedPaths = new Set(removed.map((r) => r.path));
    // Re-walk what's left (one pass, with sizes) to find both the current total and the
    // oldest aspect-version children to evict.
    const roots = await this.listAllCapsuleRoots();
    const totalBytes = roots.reduce((sum, r) => sum + r.sizeBytes, 0);
    const aspectChildren: Array<{ path: string; lastUsedMs: number; sizeBytes: number; originPath?: string }> = [];
    for (const root of roots) {
      if (
        root.kind !== 'scope-aspects-root' &&
        !(root.kind === 'unmarked' && (await this.looksLikeAspectsRoot(root.path)))
      ) {
        continue;
      }
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.readdir(root.path, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!this.isPrunableSubdir(entry)) continue;
        const childPath = path.join(root.path, entry.name);
        if (removedPaths.has(childPath)) continue;
        const { marker, lastUsedMs } = await this.readMarkerInfo(childPath);
        const sizeBytes = await this.computeDirSize(childPath);
        aspectChildren.push({ path: childPath, lastUsedMs, sizeBytes, originPath: marker?.originPath });
      }
    }
    aspectChildren.sort((a, b) => a.lastUsedMs - b.lastUsedMs);
    // In dry-run the standard-prune entries are still on disk (counted in totalBytes), so
    // subtract them; in a real run they were already moved to trash and excluded from the walk.
    let remainingBytes = totalBytes - (dryRun ? removed.reduce((s, r) => s + r.sizeBytes, 0) : 0);
    for (const child of aspectChildren) {
      if (remainingBytes <= targetBytes) break;
      await this.recordRemoval(
        removed,
        {
          path: child.path,
          kind: 'scope-aspect',
          reason: `size-target-${sizeTargetGb}gb`,
          sizeBytes: child.sizeBytes,
          originPath: child.originPath,
        },
        dryRun
      );
      remainingBytes -= child.sizeBytes;
    }
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
        } catch {
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
          manifest[keyName][entry.packageName] =
            dep.versionRange && dep.versionRange !== '+' ? dep.versionRange : version;
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
    const packageJson = this.preparePackageJsonToWrite(component, writeToPath, ids);
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
    componentDepsToIgnore: ComponentIdList
  ): PackageJsonFile {
    const legacyComp: ConsumerComponent = component.state._consumer;
    const compDeps = this.dependencyResolver.getComponentDependencies(component);
    this.logger.debug(`package-json.preparePackageJsonToWrite. bitDir ${bitDir}.`);
    const getBitDependencies = (dependencies: ComponentIdList) => {
      return dependencies.reduce((acc, depId: ComponentID) => {
        if (componentDepsToIgnore.searchWithoutVersion(depId)) {
          return acc;
        }
        const fromDepsResolver = compDeps.find((dep) => dep.componentId.isEqualWithoutVersion(depId));
        const versionWithRange = fromDepsResolver?.versionRange;

        const packageDependency = depId.version;
        const packageName = componentIdToPackageName({
          ...legacyComp,
          id: depId,
          isDependency: true,
        });
        acc[packageName] = versionWithRange || packageDependency;
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

  /**
   * Filter out unmodified exported dependencies to optimize capsule creation.
   * These dependencies can be installed as packages instead of creating capsules.
   */
  private async filterUnmodifiedExportedDependencies(
    components: Component[],
    seederIds: ComponentID[],
    host: ComponentFactory
  ): Promise<Component[]> {
    this.logger.debug(`filterUnmodifiedExportedDependencies: filtering ${components.length} components`);

    const scope = this.componentAspect.getHost('teambit.scope/scope');
    // @ts-ignore it's there, but we can't have the type of ScopeMain here to not create a circular dependency
    const remotes = await scope.getRemoteScopes();

    const filtered: Component[] = [];

    for (const component of components) {
      const componentIdStr = component.id.toString();
      const isSeeder = seederIds.some((seederId) => component.id.isEqual(seederId, { ignoreVersion: true }));

      if (isSeeder) {
        // Always include seeders (modified components and their dependents)
        filtered.push(component);
        continue;
      }
      // For dependencies, check if they are exported and unmodified

      // Check if component is modified
      // Normally, when running "bit build" with no args, only the seeders are modified, so this check is not needed.
      // However, when running "bit build comp1", comp1 might have modified dependencies. we want to include them.
      // In terms of performance, I checked on a big workspace, it costs zero time, because the modification data is cached.
      const isModified = await component.isModified();
      if (isModified) {
        // Always include modified components
        filtered.push(component);
        continue;
      }

      const isPublished = component.get('teambit.pkg/pkg')?.config?.packageJson?.publishConfig;
      const canBeInstalled =
        host.isExported(component.id) &&
        (remotes.isHub(component.id.scope) || isPublished) &&
        component.buildStatus === 'succeed';

      if (canBeInstalled) {
        this.logger.debug(`[OPTIMIZATION] Excluding unmodified exported dependency: ${componentIdStr}`);
      } else {
        filtered.push(component);
      }
    }

    this.logger.debug(
      `filterUnmodifiedExportedDependencies: kept ${filtered.length} out of ${components.length} components`
    );
    return filtered;
  }
}

IsolatorAspect.addRuntime(IsolatorMain);
