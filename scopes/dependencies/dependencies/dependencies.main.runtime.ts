import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import moment from 'moment';
import type { ComponentID } from '@teambit/component-id';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect, KEY_NAME_BY_LIFECYCLE_TYPE } from '@teambit/dependency-resolver';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect, OutsideWorkspaceError } from '@teambit/workspace';
import fs from 'fs-extra';
import path from 'path';
import semver from 'semver';
import { cloneDeep, compact, set, uniq } from 'lodash';
import pMapSeries from 'p-map-series';
import type { ConsumerComponent, DependencyLoaderOpts } from '@teambit/legacy.consumer-component';
import { ComponentLoader } from '@teambit/legacy.consumer-component';
import type { DevFilesMain } from '@teambit/dev-files';
import { DevFilesAspect } from '@teambit/dev-files';
import type { ComponentIdGraph, GraphMain } from '@teambit/graph';
import { GraphAspect } from '@teambit/graph';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { AspectLoaderAspect } from '@teambit/aspect-loader';
import { snapToSemver } from '@teambit/component-package-version';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import { DependenciesLoader } from './dependencies-loader/dependencies-loader';
import type { DependenciesData, OverridesDependenciesData } from './dependencies-loader/dependencies-data';
import type { RemoveDependenciesFlags, SetDependenciesFlags } from './dependencies-cmd';
import {
  DependenciesBlameCmd,
  DependenciesCmd,
  DependenciesDebugCmd,
  DependenciesDiagnoseCmd,
  DependenciesEjectCmd,
  DependenciesGetCmd,
  DependenciesRemoveCmd,
  DependenciesResetCmd,
  DependenciesSetCmd,
  DependenciesUnsetCmd,
  DependenciesUsageCmd,
  DependenciesWriteCmd,
  SetPeerCmd,
  UnsetPeerCmd,
  WhyCmd,
} from './dependencies-cmd';
import { DependenciesAspect } from './dependencies.aspect';
import type { DebugDependencies } from './dependencies-loader/auto-detect-deps';
import { DependentsCmd } from './dependents-cmd';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';

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

export interface DiagnosisReport {
  componentCount: number;
  /** total directories in node_modules/.pnpm — the actual installed copies on disk */
  pnpmStoreEntries: number;
  /** unique package names (regardless of version/peer combo) */
  uniquePackages: number;
  /** packages that appear in more than one .pnpm directory (version spread + peer permutations) */
  duplicatedPackages: number;
  versionSpread: Array<{
    packageName: string;
    /** how many distinct versions exist across components */
    versionCount: number;
    versions: string[];
    /** how many actual .pnpm directories this package has (includes peer permutations) */
    installedCopies: number;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  peerPermutations: Array<{
    packageName: string;
    versions: string[];
  }>;
}

/** Compare two version strings: semver-aware when both are valid, lexicographic otherwise. */
function compareVersions(a: string, b: string): number {
  return semver.valid(a) && semver.valid(b) ? semver.compare(a, b) : a.localeCompare(b);
}

export class DependenciesMain {
  constructor(
    private workspace: Workspace,
    private scope: ScopeMain,
    private dependencyResolver: DependencyResolverMain,
    private devFiles: DevFilesMain,
    private aspectLoader: AspectLoaderMain,
    private graph: GraphMain,
    private logger: Logger
  ) {}

  async setPeer(componentId: string, range?: string): Promise<void> {
    const compId = await this.workspace.resolveComponentId(componentId);
    const config = { peer: true, defaultPeerRange: range };
    await this.workspace.addSpecificComponentConfig(compId, DependencyResolverAspect.id, config, {
      shouldMergeWithExisting: true,
      shouldMergeWithPrevious: true,
    });

    await this.workspace.bitMap.write(`set-peer (${componentId})`);
    // Peer status is determined by reading the `bit.peer` field from the component's node_modules
    // package.json, which the linker writes AFTER dep resolution runs during `bit install`. This
    // means dep resolution during install re-populates the cache with stale data (no bit.peer yet),
    // and the linker's subsequent package.json update doesn't clear the cache on its own unless the
    // content actually changed (see node-modules-linker). Clearing here ensures the cache is empty
    // going into install so that after the linker writes the correct package.json, any subsequent
    // `bit show` will compute deps fresh.
    // Other dep mutations (setDependency, removeDependency, etc.) don't need this because they only
    // change the component's own .bitmap policy, which dep resolution reads directly; the normal
    // invalidateDependenciesCacheIfNeeded mechanism (checking .bitmap mtime) is sufficient there.
    await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
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
    // Same reasoning as in setPeer: clears the stale cache before the next install rewrites the
    // component's node_modules package.json without the bit.peer field.
    await this.workspace.consumer.componentFsCache.deleteAllDependenciesDataCache();
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
    const getLifeCycle = () => {
      if (options.dev) return 'dev';
      if (options.peer) return 'peer';
      return 'runtime';
    };
    const compIds = await this.workspace.idsByPattern(componentPattern);
    const results = await pMapSeries(compIds, async (compId) => {
      const component = await this.workspace.get(compId);
      const missingPackages = uniq(
        component.state.issues
          .getIssueByName('MissingPackagesDependenciesOnFs')
          ?.data.map((d) => d.missingPackages)
          .flat() || []
      );
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
      const depField = KEY_NAME_BY_LIFECYCLE_TYPE[getLifeCycle()];
      const removedPackagesWithNulls = await pMapSeries(packages, async (pkg) => {
        const [name, version] = this.splitPkgToNameAndVer(pkg);
        const dependency = depList.findByPkgNameOrCompId(name, version, getLifeCycle());
        if (!dependency) {
          if (!missingPackages.includes(name)) return null;
          if (removeOnlyIfExists) return null;
          set(newDepResolverConfig, ['policy', depField, name], '-');
          return `${name}@${version || 'latest'}`;
        }
        const depName = dependency.getPackageName?.() || dependency.id;

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
      this.aspectLoader,
      this.logger
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
      this.aspectLoader,
      this.logger
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

  /**
   * Analyze the workspace's installed dependencies to detect bloat and duplication.
   * Scans node_modules/.pnpm for ground truth on actual installed copies.
   * Only works with pnpm-managed workspaces.
   */
  async diagnose(): Promise<DiagnosisReport> {
    if (!this.workspace) throw new OutsideWorkspaceError();

    const allComps = await this.workspace.list();
    const componentCount = allComps.length;

    // 1. Scan node_modules/.pnpm for ground truth — each directory is an actual installed copy
    const pnpmDir = path.join(this.workspace.path, 'node_modules', '.pnpm');
    const pnpmDirExists = await fs.pathExists(pnpmDir);
    if (!pnpmDirExists) {
      throw new Error(
        `"bit deps diagnose" requires a pnpm-managed workspace. ` +
          `Expected "${pnpmDir}" to exist. Run "bit install" first.`
      );
    }
    const pnpmEntries = await fs.readdir(pnpmDir);

    const pnpmPackageCopies = new Map<string, number>();
    let pnpmStoreEntries = 0;
    for (const entry of pnpmEntries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      pnpmStoreEntries++;
      const pkgName = this.parsePnpmDirPackageName(entry);
      if (pkgName) {
        pnpmPackageCopies.set(pkgName, (pnpmPackageCopies.get(pkgName) || 0) + 1);
      }
    }

    const uniquePackages = pnpmPackageCopies.size;
    const duplicatedPackages = Array.from(pnpmPackageCopies.values()).filter((c) => c > 1).length;

    // 2. Collect component-level dep info (for version spread + peer lifecycle detection)
    const packageVersionMap = new Map<string, { versions: Set<string>; lifecycles: Set<string> }>();
    for (const comp of allComps) {
      const depList = this.dependencyResolver.getDependencies(comp);
      depList.forEach((dep) => {
        const pkgName = dep.getPackageName?.() || dep.id;
        let entry = packageVersionMap.get(pkgName);
        if (!entry) {
          entry = { versions: new Set(), lifecycles: new Set() };
          packageVersionMap.set(pkgName, entry);
        }
        entry.versions.add(dep.version);
        entry.lifecycles.add(dep.lifecycle);
      });
    }

    // 3. Version spread — packages with the most distinct versions, enriched with .pnpm copy count
    const versionSpread = Array.from(packageVersionMap.entries())
      .filter(([, data]) => data.versions.size > 1)
      .map(([pkgName, data]) => {
        const versionCount = data.versions.size;
        const versions = Array.from(data.versions).sort(compareVersions);
        const installedCopies = pnpmPackageCopies.get(pkgName) || versionCount;
        const impact: 'HIGH' | 'MEDIUM' | 'LOW' =
          installedCopies >= 10 ? 'HIGH' : installedCopies >= 5 ? 'MEDIUM' : 'LOW';
        return { packageName: pkgName, versionCount, versions, installedCopies, impact };
      })
      .sort((a, b) => b.installedCopies - a.installedCopies)
      .slice(0, 30);

    // 4. Peer deps with multiple versions
    const peerPermutations = Array.from(packageVersionMap.entries())
      .filter(([, data]) => data.lifecycles.has('peer') && data.versions.size > 1)
      .map(([pkgName, data]) => ({
        packageName: pkgName,
        versions: Array.from(data.versions).sort(compareVersions),
      }))
      .sort((a, b) => b.versions.length - a.versions.length);

    return {
      componentCount,
      pnpmStoreEntries,
      uniquePackages,
      duplicatedPackages,
      versionSpread,
      peerPermutations,
    };
  }

  /**
   * Parse a .pnpm directory name to extract the package name.
   * Format: @scope+name@version_peers...  or  name@version_peers...
   */
  private parsePnpmDirPackageName(dirName: string): string | null {
    if (dirName.startsWith('@')) {
      // Scoped package: @scope+name@version...
      const plusIdx = dirName.indexOf('+');
      if (plusIdx === -1) return null;
      const scope = dirName.substring(0, plusIdx);
      const rest = dirName.substring(plusIdx + 1);
      const atIdx = rest.indexOf('@');
      if (atIdx === -1) return null;
      const name = rest.substring(0, atIdx);
      return `${scope}/${name}`;
    }
    // Regular package: name@version...
    const atIdx = dirName.indexOf('@');
    if (atIdx === -1) return null;
    return dirName.substring(0, atIdx);
  }

  /** Inspect all .pnpm entries for a specific package, showing each installed copy and its peer combo. */
  async diagnoseDrillDown(
    packageName: string
  ): Promise<{ packageName: string; pnpmDirs: Array<{ version: string; peerSuffix: string | null }> }> {
    if (!this.workspace) throw new OutsideWorkspaceError();
    const pnpmDir = path.join(this.workspace.path, 'node_modules', '.pnpm');
    const pnpmDirExists = await fs.pathExists(pnpmDir);
    if (!pnpmDirExists) {
      throw new Error(
        `"bit deps diagnose --package" requires a pnpm-managed workspace. ` +
          `Expected "${pnpmDir}" to exist. Run "bit install" first.`
      );
    }
    const entries = await fs.readdir(pnpmDir);

    // Convert package name to .pnpm format: @scope/name → @scope+name
    const pnpmPrefix = packageName.replace('/', '+');

    const pnpmDirs: Array<{ version: string; peerSuffix: string | null }> = [];
    for (const entry of entries) {
      if (!entry.startsWith(pnpmPrefix + '@')) continue;
      // Extract version and peer suffix from: @scope+name@version_peer1@ver_peer2@ver
      const afterName = entry.substring(pnpmPrefix.length + 1); // skip "name@"
      const underscoreIdx = afterName.indexOf('_');
      if (underscoreIdx === -1) {
        pnpmDirs.push({ version: afterName, peerSuffix: null });
      } else {
        const version = afterName.substring(0, underscoreIdx);
        const rawPeerSuffix = afterName.substring(underscoreIdx + 1);
        const peerSegments = rawPeerSuffix.split('_').filter(Boolean);
        const peerSuffix = peerSegments.map((seg) => seg.replace(/\+/g, '/')).join(' + ') || null;
        pnpmDirs.push({ version, peerSuffix });
      }
    }

    pnpmDirs.sort(
      (a, b) => compareVersions(a.version, b.version) || (a.peerSuffix || '').localeCompare(b.peerSuffix || '')
    );

    return { packageName, pnpmDirs };
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
    LoggerAspect,
  ];

  static runtime = MainRuntime;

  static async provider([cli, workspace, depsResolver, devFiles, aspectLoader, scope, graph, loggerMain]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    DevFilesMain,
    AspectLoaderMain,
    ScopeMain,
    GraphMain,
    LoggerMain,
  ]) {
    const logger = loggerMain.createLogger(DependenciesAspect.id);
    const depsMain = new DependenciesMain(workspace, scope, depsResolver, devFiles, aspectLoader, graph, logger);
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
      new DependenciesDiagnoseCmd(depsMain),
      new DependenciesWriteCmd(workspace),
    ];
    cli.register(
      depsCmd,
      new WhyCmd(depsMain),
      new SetPeerCmd(depsMain),
      new UnsetPeerCmd(depsMain),
      new DependentsCmd(workspace)
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
