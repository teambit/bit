import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import moment from 'moment';
import { ComponentID } from '@teambit/component-id';
import {
  DependencyResolverAspect,
  DependencyResolverMain,
  KEY_NAME_BY_LIFECYCLE_TYPE,
} from '@teambit/dependency-resolver';
import { BitId } from '@teambit/legacy-bit-id';
import WorkspaceAspect, { OutsideWorkspaceError, Workspace } from '@teambit/workspace';
import { cloneDeep, compact, set } from 'lodash';
import pMapSeries from 'p-map-series';
import {
  DependencyResolver,
  updateDependenciesVersions,
} from '@teambit/legacy/dist/consumer/component/dependencies/dependency-resolver';
import { DebugDependencies } from '@teambit/legacy/dist/consumer/component/dependencies/dependency-resolver/dependencies-resolver';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import DependencyGraph from '@teambit/legacy/dist/scope/graph/scope-graph';
import { OverridesDependenciesData } from '@teambit/legacy/dist/consumer/component/dependencies/dependency-resolver/dependencies-data';
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
  RemoveDependenciesFlags,
  SetDependenciesFlags,
} from './dependencies-cmd';
import { DependenciesAspect } from './dependencies.aspect';

export type RemoveDependencyResult = { id: ComponentID; removedPackages: string[] };

export type DependenciesResultsDebug = DebugDependencies &
  OverridesDependenciesData & { coreAspects: string[]; sources: { id: string; source: string }[] };

export type DependenciesResults = {
  scopeGraph: DependencyGraph;
  workspaceGraph: DependencyGraph;
  id: BitId;
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
  constructor(private workspace: Workspace, private dependencyResolver: DependencyResolverMain) {}

  async setDependency(
    componentPattern: string,
    packages: string[],
    options: SetDependenciesFlags
  ): Promise<{ changedComps: string[]; addedPackages: Record<string, string> }> {
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
        packagesObj[name] = version;
      })
    );
    const config = {
      policy: {
        [getDepField()]: packagesObj,
      },
    };
    await Promise.all(
      compIds.map(async (compId) => {
        await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, config, true, true);
      })
    );

    await this.workspace.bitMap.write();

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
    const results = await Promise.all(
      compIds.map(async (compId) => {
        const component = await this.workspace.get(compId);
        const depList = await this.dependencyResolver.getDependencies(component);
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
      })
    );
    await this.workspace.bitMap.write();

    return compact(results);
  }

  async reset(componentPattern: string): Promise<ComponentID[]> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    await pMapSeries(compIds, async (compId) => {
      await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, { policy: {} });
    });
    await this.workspace.bitMap.write();

    return compIds;
  }

  async eject(componentPattern: string): Promise<ComponentID[]> {
    const compIds = await this.workspace.idsByPattern(componentPattern);
    await pMapSeries(compIds, async (compId) => {
      await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, {}, true, true);
    });
    await this.workspace.bitMap.write();

    return compIds;
  }

  async getDependencies(id: string): Promise<DependenciesResults> {
    // @todo: supports this on bare-scope.
    if (!this.workspace) throw new OutsideWorkspaceError();
    const compId = await this.workspace.resolveComponentId(id);
    const bitId = compId._legacy;
    const consumer = this.workspace.consumer;
    const scopeGraph = await DependencyGraph.buildGraphFromScope(consumer.scope);
    const scopeDependencyGraph = new DependencyGraph(scopeGraph);

    const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(consumer, true);
    const workspaceDependencyGraph = new DependencyGraph(workspaceGraph);

    return { scopeGraph: scopeDependencyGraph, workspaceGraph: workspaceDependencyGraph, id: bitId };
  }

  async debugDependencies(id: string): Promise<DependenciesResultsDebug> {
    // @todo: supports this on bare-scope.
    if (!this.workspace) throw new OutsideWorkspaceError();
    const compId = await this.workspace.resolveComponentId(id);
    const consumer = this.workspace.consumer;
    const component = await this.workspace.get(compId);
    const consumerComponent = component.state._consumer as ConsumerComponent;
    const dependencyResolver = new DependencyResolver(consumerComponent, consumer);
    const dependenciesData = await dependencyResolver.getDependenciesData({}, undefined);
    const debugData: DebugDependencies = dependencyResolver.debugDependenciesData;
    updateDependenciesVersions(consumer, consumerComponent, debugData.components);
    const results = await this.dependencyResolver.getDependencies(component);
    const sources = results.map((dep) => ({ id: dep.id, source: dep.source }));
    return {
      ...debugData,
      ...dependenciesData.overridesDependencies,
      coreAspects: dependenciesData.coreAspects,
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
      const depList = await this.dependencyResolver.getDependencies(component);
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

  private async getPackageNameAndVerResolved(pkg: string): Promise<[string, string]> {
    const resolveLatest = async (pkgName: string) => {
      const versionResolver = await this.dependencyResolver.getVersionResolver({});
      const resolved = await versionResolver.resolveRemoteVersion(pkgName, { rootDir: '' });
      if (!resolved.version) throw new Error(`unable to resolve version for ${pkgName}`);
      return resolved.version;
    };
    const [name, version] = this.splitPkgToNameAndVer(pkg);
    const versionResolved = !version || version === 'latest' ? await resolveLatest(name) : version;
    return [name, versionResolved];
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
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect];

  static runtime = MainRuntime;

  static async provider([cli, workspace, depsResolver]: [CLIMain, Workspace, DependencyResolverMain]) {
    const depsMain = new DependenciesMain(workspace, depsResolver);
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
    ];
    cli.register(depsCmd);

    return depsMain;
  }
}

DependenciesAspect.addRuntime(DependenciesMain);

export default DependenciesMain;
