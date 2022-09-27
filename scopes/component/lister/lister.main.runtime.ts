import { Graph } from 'graphlib';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BEFORE_LOCAL_LIST, BEFORE_REMOTE_LIST } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { BitId } from '@teambit/legacy-bit-id';
import { ComponentID } from '@teambit/component-id';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { Remote } from '@teambit/legacy/dist/remotes';
import DependencyGraph from '@teambit/legacy/dist/scope/graph/scope-graph';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import ComponentsList, {
  ListScopeResult as ListScopeResultLegacy,
} from '@teambit/legacy/dist/consumer/component/components-list';
import { ListCmd } from './list.cmd';
import { ListerAspect } from './lister.aspect';
import { GraphCmd } from './graph-cmd';

export type ListScopeResult = {
  id: ComponentID;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
  laneReadmeOf?: string[];
};

export class ListerMain {
  constructor(private logger: Logger, private workspace?: Workspace) {}

  async remoteList(scopeName: string, namespacesUsingWildcards?: string): Promise<ListScopeResult[]> {
    const remote: Remote = await getRemoteByName(scopeName, this.workspace?.consumer);
    this.logger.setStatusLine(BEFORE_REMOTE_LIST);
    const legacyListScopeResult = await remote.list(namespacesUsingWildcards);
    return this.convertListScopeResultsFromLegacy(legacyListScopeResult);
  }

  async localList(
    showAll = false,
    showRemoteVersion = false,
    namespacesUsingWildcards?: string
  ): Promise<ListScopeResult[]> {
    if (!this.workspace) {
      throw new ConsumerNotFound();
    }
    this.logger.setStatusLine(BEFORE_LOCAL_LIST);
    const componentsList = new ComponentsList(this.workspace.consumer);
    const legacyListScopeResult = await componentsList.listAll(showRemoteVersion, showAll, namespacesUsingWildcards);
    return this.convertListScopeResultsFromLegacy(legacyListScopeResult);
  }

  async generateGraph(id?: string, remote?: string, allVersions?: boolean): Promise<Graph> {
    const consumer = this.workspace?.consumer;
    if (!consumer && !remote) throw new ConsumerNotFound();
    const getBitId = (): BitId | undefined => {
      if (!id) return undefined;
      if (remote) return BitId.parse(id, true); // user used --remote so we know it has a scope
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      return consumer.getParsedId(id);
    };
    const bitId = getBitId();
    if (remote) {
      if (id) {
        // @ts-ignore scope must be set as it came from a remote
        const scopeName: string = typeof remote === 'string' ? remote : bitId.scope;
        const remoteScope = await getRemoteByName(scopeName, consumer);
        const componentDepGraph = await remoteScope.graph(bitId);
        return componentDepGraph.graph;
      }
      if (typeof remote !== 'string') {
        throw new Error('please specify remote scope name or enter an id');
      }
      const remoteScope = await getRemoteByName(remote, consumer);
      const componentDepGraph = await remoteScope.graph();
      return componentDepGraph.graph;
    }

    const onlyLatest = !allVersions;
    // @ts-ignore consumer must be set here
    const workspaceGraph = await DependencyGraph.buildGraphFromWorkspace(consumer, onlyLatest);
    const dependencyGraph = new DependencyGraph(workspaceGraph);
    if (id) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(bitId);
      const componentDepGraph = new DependencyGraph(componentGraph);
      return componentDepGraph.graph;
    }
    return dependencyGraph.graph;
  }

  private async convertListScopeResultsFromLegacy(
    legacyListScopeResult: ListScopeResultLegacy[]
  ): Promise<ListScopeResult[]> {
    const results = await Promise.all(
      legacyListScopeResult.map(async (legacyResult) => {
        const bitId = legacyResult.id;
        const componentId =
          this.workspace && !bitId.hasScope()
            ? await this.workspace.resolveComponentId(bitId)
            : ComponentID.fromLegacy(bitId);
        return {
          id: componentId,
          currentlyUsedVersion: legacyResult.currentlyUsedVersion,
          remoteVersion: legacyResult.remoteVersion,
          deprecated: legacyResult.deprecated,
          laneReadmeOf: legacyResult.laneReadmeOf,
        };
      })
    );
    return results.sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain, workspace]: [CLIMain, LoggerMain, Workspace]) {
    const logger = loggerMain.createLogger(ListerAspect.id);
    const lister = new ListerMain(logger, workspace);
    cli.register(new ListCmd(lister), new GraphCmd(lister, workspace));
    return lister;
  }
}

ListerAspect.addRuntime(ListerMain);
