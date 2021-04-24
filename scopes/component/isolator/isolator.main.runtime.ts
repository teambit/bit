import { MainRuntime } from '@teambit/cli';
import { compact, pick } from 'lodash';
import { Component, ComponentMap, ComponentAspect, ComponentID } from '@teambit/component';
import type { ComponentMain, ComponentFactory } from '@teambit/component';
import { getComponentPackageVersion } from '@teambit/component-package-version';
import { GraphAspect } from '@teambit/graph';
import type { GraphBuilder } from '@teambit/graph';
import {
  DependencyResolverAspect,
  DependencyResolverMain,
  LinkingOptions,
  WorkspacePolicy,
  InstallOptions,
  DependencyList,
  ComponentDependency,
  KEY_NAME_BY_LIFECYCLE_TYPE,
} from '@teambit/dependency-resolver';
import legacyLogger from '@teambit/legacy/dist/logger/logger';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { BitIds } from '@teambit/legacy/dist/bit-id';
import LegacyScope from '@teambit/legacy/dist/scope/scope';
import { CACHE_ROOT, DEPENDENCIES_FIELDS, PACKAGE_JSON } from '@teambit/legacy/dist/constants';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import PackageJsonFile from '@teambit/legacy/dist/consumer/component/package-json-file';
import { PathOsBasedAbsolute } from '@teambit/legacy/dist/utils/path';
import { Scope } from '@teambit/legacy/dist/scope';
import fs from 'fs-extra';
import hash from 'object-hash';
import path from 'path';
import { equals, map } from 'ramda';
import BitMap from '@teambit/legacy/dist/consumer/bit-map';
import ComponentWriter, { ComponentWriterProps } from '@teambit/legacy/dist/consumer/component-ops/component-writer';
import { Capsule } from './capsule';
import CapsuleList from './capsule-list';
import { IsolatorAspect } from './isolator.aspect';
import { symlinkBitLegacyToCapsules } from './symlink-bit-legacy-to-capsules';
import { symlinkOnCapsuleRoot, symlinkDependenciesToCapsules } from './symlink-dependencies-to-capsules';
import { Network } from './network';

const CAPSULES_BASE_DIR = path.join(CACHE_ROOT, 'capsules'); // TODO: move elsewhere

export type ListResults = {
  workspace: string;
  capsules: string[];
};

export type IsolateComponentsInstallOptions = {
  installPackages?: boolean; // default: true
  // TODO: add back when depResolver.getInstaller support it
  // packageManager?: string;
  dedupe?: boolean;
  copyPeerToRuntimeOnComponents?: boolean;
  copyPeerToRuntimeOnRoot?: boolean;
  installTeambitBit?: boolean;
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
   * the capsule root-dir based on a *hash* of this baseDir, not on the baseDir itself.
   */
  baseDir?: string;

  /**
   * create a new capsule with a random string attached to the path suffix
   */
  alwaysNew?: boolean;

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
   * Force specific host to get the component from.
   */
  host?: ComponentFactory;
};

type CapsulePackageJsonData = {
  capsule: Capsule;
  currentPackageJson?: Record<string, any>;
  previousPackageJson: Record<string, any> | null;
};

const DEFAULT_ISOLATE_INSTALL_OPTIONS: IsolateComponentsInstallOptions = {
  installPackages: true,
  dedupe: true,
  copyPeerToRuntimeOnComponents: false,
  copyPeerToRuntimeOnRoot: true,
};

export class IsolatorMain {
  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect, LoggerAspect, ComponentAspect, GraphAspect];
  static defaultConfig = {};
  _componentsPackagesVersionCache: { [idStr: string]: string } = {}; // cache packages versions of components

  static async provider([dependencyResolver, loggerExtension, componentAspect, graphAspect]: [
    DependencyResolverMain,
    LoggerMain,
    ComponentMain,
    GraphBuilder
  ]): Promise<IsolatorMain> {
    const logger = loggerExtension.createLogger(IsolatorAspect.id);
    const isolator = new IsolatorMain(dependencyResolver, logger, componentAspect, graphAspect);
    return isolator;
  }
  constructor(
    private dependencyResolver: DependencyResolverMain,
    private logger: Logger,
    private componentAspect: ComponentMain,
    private graphBuilder: GraphBuilder
  ) {}

  // TODO: the legacy scope used for the component writer, which then decide if it need to write the artifacts and dists
  // TODO: we should think of another way to provide it (maybe a new opts) then take the scope internally from the host
  async isolateComponents(
    seeders: ComponentID[],
    opts: IsolateComponentsOptions = {},
    legacyScope?: LegacyScope
  ): Promise<Network> {
    const host = this.componentAspect.getHost();
    const longProcessLogger = this.logger.createLongProcessLogger('create capsules network');
    legacyLogger.debug(
      `isolatorExt, createNetwork ${seeders.join(', ')}. opts: ${JSON.stringify(
        Object.assign({}, opts, { host: opts.host?.name })
      )}`
    );
    const createGraphOpts = pick(opts, ['includeFromNestedHosts', 'host']);
    const componentsToIsolate = opts.seedersOnly
      ? await host.getMany(seeders)
      : await this.createGraph(seeders, createGraphOpts);
    opts.baseDir = opts.baseDir || host.path;
    const capsuleList = await this.createCapsules(componentsToIsolate, opts, legacyScope);
    longProcessLogger.end();
    this.logger.consoleSuccess();
    return new Network(capsuleList, seeders, this.getCapsulesRootDir(opts.baseDir));
  }

  private async createGraph(seeders: ComponentID[], opts: CreateGraphOptions = {}): Promise<Component[]> {
    const host = this.componentAspect.getHost();
    const getGraphOpts = pick(opts, ['host']);
    const graph = await this.graphBuilder.getGraph(seeders, getGraphOpts);
    const successorsSubgraph = graph.successorsSubgraph(seeders.map((id) => id.toString()));
    const compsAndDeps = successorsSubgraph.nodes.map((node) => node.attr);
    // do not ignore the version here. a component might be in .bitmap with one version and
    // installed as a package with another version. we don't want them both.
    const existingCompsP = compsAndDeps.map(async (c) => {
      let existing;
      if (opts.includeFromNestedHosts) {
        existing = await host.hasIdNested(c.id, true);
      } else {
        existing = await host.hasId(c.id);
      }
      if (existing) return c;
      return undefined;
    });
    const existingComps = await Promise.all(existingCompsP);
    return compact(existingComps);
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
    opts: IsolateComponentsOptions,
    legacyScope?: Scope
  ): Promise<CapsuleList> {
    const config = { installPackages: true, ...opts };
    const capsulesDir = this.getCapsulesRootDir(opts.baseDir as string);
    if (opts.emptyRootDir) {
      await fs.emptyDir(capsulesDir);
    }
    const capsules = await this.createCapsulesFromComponents(components, capsulesDir, config);
    const capsuleList = CapsuleList.fromArray(capsules);
    if (opts.getExistingAsIs) {
      return capsuleList;
    }

    if (opts.skipIfExists) {
      const existingCapsules = CapsuleList.fromArray(
        capsuleList.filter((capsule) => capsule.fs.existsSync('package.json'))
      );

      if (existingCapsules.length === capsuleList.length) return existingCapsules;
    }
    const capsulesWithPackagesData = await this.getCapsulesPreviousPackageJson(capsules);

    await this.writeComponentsInCapsules(components, capsuleList, legacyScope);
    await this.updateWithCurrentPackageJsonData(capsulesWithPackagesData, capsuleList);
    const installOptions = Object.assign({}, DEFAULT_ISOLATE_INSTALL_OPTIONS, opts.installOptions || {});
    if (installOptions.installPackages) {
      await this.installInCapsules(capsulesDir, capsuleList, installOptions, opts.cachePackagesOnCapsulesRoot ?? false);
      await this.linkInCapsules(capsulesDir, capsuleList, capsulesWithPackagesData, opts.linkingOptions ?? {});
    }

    // rewrite the package-json with the component dependencies in it. the original package.json
    // that was written before, didn't have these dependencies in order for the package-manager to
    // be able to install them without crushing when the versions don't exist yet
    capsulesWithPackagesData.forEach((capsuleWithPackageData) => {
      capsuleWithPackageData.capsule.fs.writeFileSync(
        PACKAGE_JSON,
        JSON.stringify(capsuleWithPackageData.currentPackageJson, null, 2)
      );
    });

    return capsuleList;
  }

  private async installInCapsules(
    capsulesDir: string,
    capsuleList: CapsuleList,
    isolateInstallOptions: IsolateComponentsInstallOptions,
    cachePackagesOnCapsulesRoot: boolean
  ) {
    const installer = this.dependencyResolver.getInstaller({
      rootDir: capsulesDir,
      cacheRootDirectory: cachePackagesOnCapsulesRoot ? capsulesDir : undefined,
    });
    // When using isolator we don't want to use the policy defined in the workspace directly,
    // we only want to instal deps from components and the peer from the workspace

    const peerOnlyPolicy = this.getPeersOnlyPolicy();
    const installOptions: InstallOptions = {
      installTeambitBit: !!isolateInstallOptions.installTeambitBit,
    };
    const packageManagerInstallOptions = {
      dedupe: isolateInstallOptions.dedupe,
      copyPeerToRuntimeOnComponents: isolateInstallOptions.copyPeerToRuntimeOnComponents,
      copyPeerToRuntimeOnRoot: isolateInstallOptions.copyPeerToRuntimeOnRoot,
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
  ) {
    const linker = this.dependencyResolver.getLinker({
      rootDir: capsulesDir,
      linkingOptions,
    });
    const peerOnlyPolicy = this.getPeersOnlyPolicy();
    const capsulesWithModifiedPackageJson = this.getCapsulesWithModifiedPackageJson(capsulesWithPackagesData);
    await linker.link(capsulesDir, peerOnlyPolicy, this.toComponentMap(capsuleList), {
      ...linkingOptions,
      legacyLink: false,
    });
    await symlinkOnCapsuleRoot(capsuleList, this.logger, capsulesDir);
    await symlinkDependenciesToCapsules(capsulesWithModifiedPackageJson, capsuleList, this.logger);
    // TODO: this is a hack to have access to the bit bin project in order to access core extensions from user extension
    // TODO: remove this after exporting core extensions as components
    await symlinkBitLegacyToCapsules(capsulesWithModifiedPackageJson, this.logger);
    // await copyBitLegacyToCapsuleRoot(capsulesDir, this.logger);
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

  private async writeComponentsInCapsules(components: Component[], capsuleList: CapsuleList, legacyScope?: Scope) {
    const legacyComponents = components.map((component) => component.state._consumer.clone());
    const allIds = BitIds.fromArray(legacyComponents.map((c) => c.id));
    await Promise.all(
      components.map(async (component) => {
        const capsule = capsuleList.getCapsule(component.id);
        if (!capsule) return;
        const params = this.getComponentWriteParams(component.state._consumer, allIds, legacyScope);
        const componentWriter = new ComponentWriter(params);
        await componentWriter.populateComponentsFilesToWrite();
        await component.state._consumer.dataToPersist.persistAllToCapsule(capsule, { keepExistingCapsule: true });
      })
    );
  }

  private getPeersOnlyPolicy(): WorkspacePolicy {
    const workspacePolicy = this.dependencyResolver.getWorkspacePolicy();
    const peerOnlyPolicy = workspacePolicy.byLifecycleType('peer');
    return peerOnlyPolicy;
  }

  private getComponentWriteParams(
    component: ConsumerComponent,
    ids: BitIds,
    legacyScope?: Scope
  ): ComponentWriterProps {
    return {
      component,
      // @ts-ignore
      bitMap: new BitMap(undefined, undefined, undefined, false),
      writeToPath: '.',
      origin: 'IMPORTED',
      consumer: undefined,
      scope: legacyScope,
      override: false,
      writePackageJson: true,
      writeConfig: false,
      ignoreBitDependencies: ids,
      excludeRegistryPrefix: false,
      isolated: true,
    };
  }

  private toComponentMap(capsuleList: CapsuleList): ComponentMap<string> {
    const tuples: [Component, string][] = capsuleList.map((capsule) => {
      return [capsule.component, capsule.path];
    });

    return ComponentMap.create(tuples);
  }

  async list(workspacePath: string): Promise<ListResults> {
    try {
      const workspaceCapsuleFolder = this.getCapsulesRootDir(workspacePath);
      const capsules = await fs.readdir(workspaceCapsuleFolder);
      const capsuleFullPaths = capsules.map((c) => path.join(workspaceCapsuleFolder, c));
      return {
        workspace: workspacePath,
        capsules: capsuleFullPaths,
      };
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { workspace: workspacePath, capsules: [] };
      }
      throw e;
    }
  }

  getCapsulesRootDir(baseDir: string): PathOsBasedAbsolute {
    return path.join(CAPSULES_BASE_DIR, hash(baseDir));
  }

  private async createCapsulesFromComponents(
    components: Component[],
    baseDir: string,
    opts: IsolateComponentsOptions
  ): Promise<Capsule[]> {
    const capsules: Capsule[] = await Promise.all(
      map((component: Component) => {
        return Capsule.createFromComponent(component, baseDir, opts);
      }, components)
    );
    return capsules;
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
        } catch (e) {
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
    const updateP = capsules.map(async (capsule) => {
      const packageJson = await this.getCurrentPackageJson(capsule, capsules);
      const found = capsulesWithPackagesData.find((c) => c.capsule.component.id.isEqual(capsule.component.id));
      if (!found) throw new Error(`updateWithCurrentPackageJsonData unable to find ${capsule.component.id}`);
      found.currentPackageJson = packageJson.packageJsonObject;
    });
    return Promise.all(updateP);
  }

  private async getCurrentPackageJson(capsule: Capsule, capsules: CapsuleList): Promise<PackageJsonFile> {
    const component: Component = capsule.component;
    const currentVersion = await this.getComponentPackageVersionWithCache(component);
    // const newVersion = '0.0.1-new';
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
          version = await this.getComponentPackageVersionWithCache(depCapsule?.component);
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

    // unfortunately, component.packageJsonFile is not available here.
    // the reason is that `writeComponentsToCapsules` clones the component before writing them
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

  private async getComponentPackageVersionWithCache(component: Component): Promise<string> {
    const idStr = component.id.toString();
    if (this._componentsPackagesVersionCache[idStr]) {
      return this._componentsPackagesVersionCache[idStr];
    }
    const version = await getComponentPackageVersion(component);
    this._componentsPackagesVersionCache[idStr] = version;
    return version;
  }
}

IsolatorAspect.addRuntime(IsolatorMain);
