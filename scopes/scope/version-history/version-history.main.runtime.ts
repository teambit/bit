import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { getRemoteByName } from '@teambit/scope.remotes';
import { loadConsumerIfExist } from '@teambit/legacy.consumer';
import { VersionHistoryAspect } from './version-history.aspect';
import {
  BuildOptions,
  ShowOptions,
  VersionHistoryBuildCmd,
  VersionHistoryCmd,
  VersionHistoryGraphCmd,
  VersionHistoryShowCmd,
} from './version-history-cmd';
import { ScopeAspect, ScopeMain } from '@teambit/scope';
import { ComponentID, ComponentIdList } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import { VersionHistoryGraph, Ref, ModelComponent, VersionHistory } from '@teambit/scope.objects';
import { ExternalActions } from '@teambit/legacy.scope-api';
import { BuildVersionHistoryAction } from './build-version-history-action';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { compact } from 'lodash';
import { CatVersionHistoryCmd } from './cat-version-history-cmd';

type BuildResult = { err?: Error; added?: string[] };
type ShowResult = { node: string; pointers: string[]; edges: Array<{ hash: string; type: string }> };

export class VersionHistoryMain {
  constructor(
    private scope: ScopeMain,
    private logger: Logger
  ) {}

  async build(id: ComponentID, options: BuildOptions = {}): Promise<BuildResult> {
    const { fromSnap } = options;
    const modelComponent = (await this.scope.getBitObjectModelComponent(
      id.changeVersion(undefined),
      true
    )) as ModelComponent;
    const from = fromSnap ? Ref.from(fromSnap) : modelComponent.getHead();
    if (!from) {
      throw new BitError(`error: ${id.toString()} has no head and "fromSnap" is not provided`);
    }
    const repo = this.scope.legacyScope.objects;
    let versionHistory = await modelComponent.getVersionHistory(repo);
    if (options.deleteExisting) {
      await this.scope.legacyScope.objects.moveObjectsToTrash([versionHistory.hash()]);
      versionHistory = await modelComponent.getVersionHistory(repo);
    }

    const isGraphComplete = versionHistory.isGraphCompleteSince(from);
    if (isGraphComplete) {
      return {};
    }

    await this.scope.legacyScope.scopeImporter.importWithoutDeps(ComponentIdList.fromArray([id]), {
      cache: false,
      includeVersionHistory: true,
      collectParents: true,
      reason: 'to retrieve missing versions',
    });

    const results = await modelComponent.populateVersionHistoryIfMissingGracefully(repo, versionHistory, from, false);
    const added = results.added?.map((a) => a.hash.toString()) || [];
    if (added.length)
      this.logger.debug(`version-history: added ${added.length} hashes to ${id.toString()}:\n${added.join('\n')}`);

    if (options.fromAllLanes) {
      const lanes = await this.scope.legacyScope.lanes.listLanes();
      for await (const lane of lanes) {
        const headOnLane = lane.getComponentHead(id);
        if (!headOnLane) continue;
        const laneResults = await modelComponent.populateVersionHistoryIfMissingGracefully(
          repo,
          versionHistory,
          headOnLane,
          false
        );
        const laneAdded = laneResults.added?.map((a) => a.hash.toString());
        if (laneAdded) {
          this.logger.debug(
            `version-history: added ${laneAdded.length} hashes from lane "${lane.name}":\n${laneAdded.join('\n')}`
          );
          added.push(...laneAdded);
        }
      }
    }

    return { err: results.err, added };
  }

  async show(id: string, options: ShowOptions): Promise<ShowResult[]> {
    const graph = await this.generateGraph(id, options.shortHash);

    const results: ShowResult[] = graph.toposort().map((node) => {
      const metadata = typeof node.attr === 'string' ? undefined : node.attr;
      const pointers = compact([...(metadata?.pointers || []), metadata?.tag]);
      const edges = graph.outEdges(node.id).map((e) => ({ hash: e.targetId, type: e.attr }));
      return { node: node.id, pointers, edges };
    });
    return results;
  }

  async get(id: ComponentID): Promise<VersionHistory> {
    const modelComponent = (await this.scope.getBitObjectModelComponent(id, true)) as ModelComponent;
    const repo = this.scope.legacyScope.objects;
    const versionHistory = modelComponent.getVersionHistory(repo);
    return versionHistory;
  }

  async generateGraph(id: string, shortHash?: boolean): Promise<VersionHistoryGraph> {
    const compId = await this.scope.resolveComponentId(id);
    const modelComponent = (await this.scope.getBitObjectModelComponent(compId, true)) as ModelComponent;
    const repo = this.scope.legacyScope.objects;
    const versionHistory = await modelComponent.getVersionHistory(repo);
    const lanePerRef = await repo.remoteLanes.getRefsPerLaneId(compId);
    if (modelComponent.head) {
      lanePerRef.main = modelComponent.head;
    }
    // convert to hash per lane
    const laneHeads: { [hash: string]: string[] } = {};
    Object.keys(lanePerRef).forEach((lane) => {
      const hash = lanePerRef[lane].toString();
      if (!laneHeads[hash]) laneHeads[hash] = [];
      laneHeads[hash].push(lane);
    });

    return versionHistory.getGraph(modelComponent, laneHeads, shortHash);
  }

  async buildOnRemote(
    remote: string,
    pattern: string,
    options: BuildOptions
  ): Promise<{ [idStr: string]: BuildResult }> {
    const maybeConsumer = await loadConsumerIfExist();
    const remoteObj = await getRemoteByName(remote, maybeConsumer);
    const remoteOptions = { pattern, ...options };
    const result = await remoteObj.action('BuildVersionHistoryAction', remoteOptions);
    return result as { [idStr: string]: BuildResult };
  }

  async buildByPattern(pattern: string, options: BuildOptions): Promise<{ [idStr: string]: BuildResult }> {
    const { remote } = options;
    if (remote) {
      delete options.remote;
      return this.buildOnRemote(remote, pattern, options);
    }
    const ids = await this.scope.idsByPattern(pattern);
    if (ids.length > 1 && options.fromSnap) {
      throw new BitError(`to use the "--from-snap" flag, please provide a single component-id, not a pattern`);
    }
    const results = {};
    for await (const id of ids) {
      const result = await this.build(id, options);
      results[id.toString()] = result;
    }
    return results;
  }

  static slots = [];
  static dependencies = [CLIAspect, ScopeAspect, LoggerAspect];
  static runtime = MainRuntime;
  static async provider([cli, scope, loggerMain]: [CLIMain, ScopeMain, LoggerMain]) {
    const logger = loggerMain.createLogger(VersionHistoryAspect.id);
    const versionHistory = new VersionHistoryMain(scope, logger);
    const versionHistoryCmd = new VersionHistoryCmd();
    versionHistoryCmd.commands = [
      new VersionHistoryGraphCmd(versionHistory),
      new VersionHistoryShowCmd(versionHistory),
      new VersionHistoryBuildCmd(versionHistory),
    ];
    cli.register(versionHistoryCmd, new CatVersionHistoryCmd());
    ExternalActions.externalActions.push(new BuildVersionHistoryAction(versionHistory));
    return versionHistory;
  }
}

VersionHistoryAspect.addRuntime(VersionHistoryMain);

export default VersionHistoryMain;
