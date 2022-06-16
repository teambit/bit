import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { BEFORE_LOCAL_LIST, BEFORE_REMOTE_LIST } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { ComponentID } from '@teambit/component-id';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { Remote } from '@teambit/legacy/dist/remotes';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import ComponentsList, {
  ListScopeResult as ListScopeResultLegacy,
} from '@teambit/legacy/dist/consumer/component/components-list';
import { ListCmd } from './list.cmd';
import { ListerAspect } from './lister.aspect';

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

  private async convertListScopeResultsFromLegacy(
    legacyListScopeResult: ListScopeResultLegacy[]
  ): Promise<ListScopeResult[]> {
    return Promise.all(
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
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain, workspace]: [CLIMain, LoggerMain, Workspace]) {
    const logger = loggerMain.createLogger(ListerAspect.id);
    const lister = new ListerMain(logger, workspace);
    if (!workspace || !workspace.isLegacy) {
      cli.unregister('list');
      cli.register(new ListCmd(lister));
    }
    return lister;
  }
}

ListerAspect.addRuntime(ListerMain);
