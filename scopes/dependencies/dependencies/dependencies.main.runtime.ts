import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import moment from 'moment';
import { ComponentID } from '@teambit/component-id';
import {
  DependencyResolverAspect,
  DependencyResolverMain,
  KEY_NAME_BY_LIFECYCLE_TYPE,
} from '@teambit/dependency-resolver';
import { WorkspaceAspect, OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { cloneDeep, compact, set } from 'lodash';
import pMapSeries from 'p-map-series';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import ComponentLoader, { DependencyLoaderOpts } from '@teambit/legacy/dist/consumer/component/component-loader';
import { DevFilesAspect, DevFilesMain } from '@teambit/dev-files';
import { GraphAspect, ComponentIdGraph, GraphMain } from '@teambit/graph';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { snapToSemver } from '@teambit/component-package-version';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { DependenciesLoader } from './dependencies-loader/dependencies-loader';
import { DependenciesData, OverridesDependenciesData } from './dependencies-loader/dependencies-data';
import {
  DependenciesBlameCmd,
  DependenciesCmd,
  DependenciesDebugCmd,
  DependenciesEjectCmd,
  DependenciesGetCmd,
  DependenciesRemoveCmd,
  DependenciesResetCmd,
  DependenciesSetCmd,
  DependenciesUnsetCmd,
  DependenciesUsageCmd,
  RemoveDependenciesFlags,
  SetDependenciesFlags,
  SetPeerCmd,
  UnsetPeerCmd,
  WhyCmd,
} from './dependencies-cmd';
import { DependenciesAspect } from './dependencies.aspect';
import { DebugDependencies } from './dependencies-loader/auto-detect-deps';
import { DependentsCmd } from './dependents-cmd';

export type RemoveDependencyResult = { id: ComponentID; removedPackages: string[] };
export type SetDependenciesResult = { changedComps: string[]; addedPackages: Record<string, string> };
export type DependenciesResultsDebug = DebugDependencies &
  OverridesDependenciesData & { coreAspects: string[]; sources: { id: string; source: string }[] };

export type DependenciesResults = {
  graph: ComponentIdGraph;
  id: ComponentID;
};

export type BlameResult = {
  snap: string;
  tag?: string;
  author: string;
  date: string;
  message: string;
  version: string;
};

export class DependenciesMain {
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private dependencyResolver: DependencyResolverMain,
    private devFiles: DevFilesMain,
    private aspectLoader: AspectLoaderMain,
    private graph: GraphMain
  ) {}

  async setPeer(componentId: string, range?: string): Promise<void> {
    const compId = await this.workspace.resolveComponentId(componentId);
    const config = { peer: true, defaultPeerRange: range };
    await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, config, {
      shouldMergeWithExisting: true,
      shouldMergeWithPrevious: true,
    });

    await this.workspace.bitMap.write(`set-peer (${componentId})`);
  }

  async unsetPeer(componentId: string): Promise<void> {
    const compId = await this.workspace.resolveComponentId(componentId);
    // const config = { peer: true, defaultPeerRange: range };
    const config = await this.workspace.getAspectConfigForComponent(compId, DependencyResolverAspect.id);
    if (config) {
      if ('peer' in config) {
        delete config.peer;
      }
      if ('defaultPeerRange' in config) {
        delete config.defaultPeerRange;
      }
    }
    this.workspace.bitMap.addComponentConfig(compId, DependencyResolverAspect.id, config);

    await this.workspace.bitMap.write(`unset-peer (${componentId})`);
  }

  async setDependency(
    componentPattern: string,
    packages: string[],
    options: SetDependenciesFlags = {}
  ): Promise<SetDependenciesResult> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    const getDepField = () => {
      if (options.dev) return 'devDependencies';
      if (options.peer) return 'peerDependencies';
      return 'dependencies';
    };
    const packagesObj = {};
    await Promise.all(
      packages.map(async (pkg) => {
        const [name, version] = await this.getPackageNameAndVerResolved(pkg);
        if (options.optional) {
          packagesObj[name] = { optional: true, version };
        } else {
          packagesObj[name] = version;
        }
      })
    );
    const config = {
      policy: {
        [getDepField()]: packagesObj,
      },
    };
    await Promise.all(
      compIds.map(async (compId) => {
        await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, config, {
          shouldMergeWithExisting: true,
          shouldMergeWithPrevious: true,
        });
      })
    );

    await this.workspace.bitMap.write(`deps-set (${componentPattern})`);

    return {
      changedComps: compIds.map((compId) => compId.toStringWithoutVersion()),
      addedPackages: packagesObj,
    };
  }

  async removeDependency(
    componentPattern: string,
    packages: string[],
    options: RemoveDependenciesFlags = {},
    removeOnlyIfExists = false // unset
  ): Promise<RemoveDependencyResult[]> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    const results = await pMapSeries(compIds, async (compId) => {
      const component = await this.workspace.get(compId);
      const depList = this.dependencyResolver.getDependencies(component);
      const getCurrentConfig = async () => {
        const currentConfigFromWorkspace = await this.workspace.getSpecificComponentConfig(
          compId,
          DependencyResolverAspect.id
        );
        if (currentConfigFromWorkspace) return currentConfigFromWorkspace;
        const extFromScope = await this.workspace.getExtensionsFromScopeAndSpecific(compId);
        return extFromScope?.toConfigObject()[DependencyResolverAspect.id];
      };
      const currentDepResolverConfig = await getCurrentConfig();
      const newDepResolverConfig = cloneDeep(currentDepResolverConfig || {});
      const removedPackagesWithNulls = await pMapSeries(packages, async (pkg) => {
        const [name, version] = this.splitPkgToNameAndVer(pkg);
        const dependency = depList.findByPkgNameOrCompId(name, version);
        if (!dependency) return null;
        const depName = dependency.getPackageName?.() || dependency.id;
        const getLifeCycle = () => {
          if (options.dev) return 'dev';
          if (options.peer) return 'peer';
          return dependency.lifecycle;
        };
        const depField = KEY_NAME_BY_LIFECYCLE_TYPE[getLifeCycle()];
        const existsInSpecificConfig = newDepResolverConfig.policy?.[depField]?.[depName];
        if (existsInSpecificConfig) {
          if (existsInSpecificConfig === '-') return null;
          delete newDepResolverConfig.policy[depField][depName];
        } else {
          if (removeOnlyIfExists) return null;
          set(newDepResolverConfig, ['policy', depField, depName], '-');
        }
        return `${depName}@${dependency.version}`;
      });
      const removedPackages = compact(removedPackagesWithNulls);
      if (!removedPackages.length) return null;
      await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, newDepResolverConfig);
      return { id: compId, removedPackages };
    });
    await this.workspace.bitMap.write(`deps-remove (${componentPattern})`);

    return compact(results);
  }

  async reset(componentPattern: string): Promise<ComponentID[]> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    await pMapSeries(compIds, async (compId) => {
      await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, { policy: {} });
    });
    await this.workspace.bitMap.write(`deps-reset (${componentPattern})`);

    return compIds;
  }

  async eject(componentPattern: string): Promise<ComponentID[]> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    await pMapSeries(compIds, async (compId) => {
      await this.workspace.addSpecificComponentConfig(
        compId,
        DependencyResolverAspect.id,
        {},
        {
          shouldMergeWithExisting: true,
          shouldMergeWithPrevious: true,
        }
      );
    });
    await this.workspace.bitMap.write(`deps-eject (${componentPattern})`);

    return compIds;
  }

  async getDependencies(id: string, scope?: boolean): Promise<DependenciesResults> {
    const factory = this.workspace && !scope ? this.workspace : this.scope;
    const compId = await (this.workspace || this.scope).resolveComponentId(id);
    const comp = await (this.workspace || this.scope).get(compId);
    const compIdWithVer = comp.id;
    const graph = await this.graph.getGraphIds([compIdWithVer], { host: factory as any });

    return { graph, id: compIdWithVer };
  }

  async loadDependencies(component: ConsumerComponent, opts: DependencyLoaderOpts) {
    const dependenciesLoader = new DependenciesLoader(
      component,
      this.dependencyResolver,
      this.devFiles,
      this.aspectLoader
    );
    return dependenciesLoader.load(this.workspace, opts);
  }

  /**
   * load dependencies without the need for the workspace.
   * the "auto-detect" are passed here as "dependenciesData". the "overrides", such as dependencies from the env,
   * are calculated here.
   * eventually all these dependencies are added to the ConsumerComponent object.
   */
  async loadDependenciesFromScope(component: ConsumerComponent, dependenciesData: Partial<DependenciesData>) {
    const dependenciesLoader = new DependenciesLoader(
      component,
      this.dependencyResolver,
      this.devFiles,
      this.aspectLoader
    );
    return dependenciesLoader.loadFromScope(dependenciesData);
  }

  async debugDependencies(id: string): Promise<DependenciesResultsDebug> {
    // @todo: supports this on bare-scope.
    if (!this.workspace) throw new OutsideWorkspaceError();
    const compId = await this.workspace.resolveComponentId(id);
    const component = await this.workspace.get(compId);
    const consumerComponent = component.state._consumer as ConsumerComponent;

    const dependenciesData = await this.loadDependencies(consumerComponent, {
      cacheResolvedDependencies: {},
      useDependenciesCache: false,
    });

    const { missingPackageDependencies, manuallyAddedDependencies, manuallyRemovedDependencies } =
      dependenciesData.overridesDependencies;

    const results = this.dependencyResolver.getDependencies(component);
    const sources = results.map((dep) => ({ id: dep.id, source: dep.source }));

    return {
      ...dependenciesData.debugDependenciesData,
      manuallyRemovedDependencies,
      manuallyAddedDependencies,
      missingPackageDependencies,
      coreAspects: dependenciesData.dependenciesData.coreAspects,
      sources,
    };
  }

  /**
   * helps determine what snap/tag changed a specific dependency.
   * the results are sorted from the oldest to newest.
   */
  async blame(compName: string, depName: string) {
    const id = await this.workspace.resolveComponentId(compName);
    const log = await this.workspace.scope.getLogs(id);
    const blameResults: BlameResult[] = [];
    let lastVersion = '';
    await pMapSeries(log, async (logItem) => {
      const component = await this.workspace.get(id.changeVersion(logItem.tag || logItem.hash));
      const depList = this.dependencyResolver.getDependencies(component);
      const dependency = depList.findByPkgNameOrCompId(depName);
      if (dependency && dependency.version === lastVersion) {
        return;
      }
      let version: string;
      if (!dependency) {
        if (!lastVersion) return;
        version = '<REMOVED>';
      } else {
        version = dependency.version;
      }
      if (!dependency || dependency.version === lastVersion) return;
      lastVersion = dependency.version;
      blameResults.push({
        snap: logItem.hash,
        tag: logItem.tag,
        author: logItem.username || '<N/A>',
        date: logItem.date ? moment(new Date(parseInt(logItem.date))).format('YYYY-MM-DD HH:mm:ss') : '<N/A>',
        message: logItem.message,
        version,
      });
    });
    return blameResults;
  }

  async usageDeep(depName: string, opts?: { depth?: number }): Promise<string | undefined> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    if (!isComponentId(depName)) {
      return this.dependencyResolver.getPackageManager()?.findUsages?.(depName, {
        lockfileDir: this.workspace.path,
        depth: opts?.depth,
      });
    }
    return undefined;
  }

  /**
   * @param depName either component-id-string or package-name (of the component or not component)
   * @returns a map of component-id-string to the version of the dependency
   */
  async usage(depName: string): Promise<{ [compIdStr: string]: string }> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const [name, version] = this.splitPkgToNameAndVer(depName);
    const allComps = await this.workspace.list();
    const results = {};
    await Promise.all(
      allComps.map(async (comp) => {
        const depList = this.dependencyResolver.getDependencies(comp);
        const dependency = depList.findByPkgNameOrCompId(name, version);
        if (dependency) {
          results[comp.id.toString()] = dependency.version;
        }
      })
    );
    return results;
  }

  private async getPackageNameAndVerResolved(pkg: string): Promise<[string, string]> {
    const resolveLatest = async (pkgName: string) => {
      const versionResolver = await this.dependencyResolver.getVersionResolver({});
      const resolved = await versionResolver.resolveRemoteVersion(pkgName, { rootDir: '' });
      if (!resolved.version) throw new Error(`unable to resolve version for ${pkgName}`);
      return resolved.version;
    };
    const [name, version] = this.splitPkgToNameAndVer(pkg);
    const versionResolved = !version || version === 'latest' ? await resolveLatest(name) : version;
    return [name, snapToSemver(versionResolved)];
  }

  private splitPkgToNameAndVer(pkg: string): [string, string | undefined] {
    const packageSplit = pkg.split('@');
    if (pkg.startsWith('@')) {
      // scoped package
      if (packageSplit.length > 3) throw new Error(`invalid package "${pkg}" syntax, expected "package[@version]"`);
      return [`@${packageSplit[1]}`, packageSplit[2]];
    }
    if (packageSplit.length > 2) throw new Error(`invalid package "${pkg}" syntax, expected "package[@version]"`);
    return [packageSplit[0], packageSplit[1]];
  }

  static slots = [];
  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    DependencyResolverAspect,
    DevFilesAspect,
    AspectLoaderAspect,
    ScopeAspect,
    GraphAspect,
  ];

  static runtime = MainRuntime;

  static async provider([cli, workspace, depsResolver, devFiles, aspectLoader, scope, graph]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    DevFilesMain,
    AspectLoaderMain,
    ScopeMain,
    GraphMain
  ]) {
    const depsMain = new DependenciesMain(workspace, scope, depsResolver, devFiles, aspectLoader, graph);
    const depsCmd = new DependenciesCmd();
    depsCmd.commands = [
      new DependenciesGetCmd(depsMain),
      new DependenciesRemoveCmd(depsMain),
      new DependenciesUnsetCmd(depsMain),
      new DependenciesDebugCmd(depsMain),
      new DependenciesSetCmd(depsMain),
      new DependenciesResetCmd(depsMain),
      new DependenciesEjectCmd(depsMain),
      new DependenciesBlameCmd(depsMain),
      new DependenciesUsageCmd(depsMain),
    ];
    cli.register(
      depsCmd,
      new WhyCmd(depsMain),
      new SetPeerCmd(depsMain),
      new UnsetPeerCmd(depsMain),
      new DependentsCmd()
    );

    ComponentLoader.loadDeps = depsMain.loadDependencies.bind(depsMain);

    return depsMain;
  }
}

function isComponentId(depName: string) {
  return depName.includes('/') && depName[0] !== '@';
}

DependenciesAspect.addRuntime(DependenciesMain);

export default DependenciesMain;
