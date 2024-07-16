import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Logger, LoggerAspect, LoggerMain } from '@teambit/logger';
import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { BEFORE_LOCAL_LIST, BEFORE_REMOTE_LIST } from '@teambit/legacy/dist/cli/loader/loader-messages';
import { ComponentID } from '@teambit/component-id';
import { ConsumerNotFound } from '@teambit/legacy/dist/consumer/exceptions';
import { Remote } from '@teambit/legacy/dist/remotes';
import getRemoteByName from '@teambit/legacy/dist/remotes/get-remote-by-name';
import { ComponentsList } from '@teambit/legacy.component-list';
import { BitError } from '@teambit/bit-error';
import { ListCmd } from './list.cmd';
import { ListerAspect } from './lister.aspect';
import { NoIdMatchWildcard } from './no-id-match-wildcard';

export type ListScopeResult = {
  id: ComponentID;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
  removed?: boolean;
  laneReadmeOf?: string[];
};

export class ListerMain {
  constructor(private logger: Logger, private workspace?: Workspace) {}

  async remoteList(
    scopeName: string,
    {
      namespacesUsingWildcards,
      includeDeprecated = true,
      includeDeleted = false,
    }: {
      namespacesUsingWildcards?: string;
      includeDeprecated?: boolean;
      includeDeleted?: boolean;
    }
  ): Promise<ListScopeResult[]> {
    const remote: Remote = await getRemoteByName(scopeName, this.workspace?.consumer);
    this.logger.setStatusLine(BEFORE_REMOTE_LIST);
    const listResult = await remote.list(namespacesUsingWildcards, includeDeleted);
    return includeDeprecated ? listResult : listResult.filter((r) => !r.deprecated);
  }

  async getRemoteCompIdsByWildcards(idStr: string, includeDeprecated = true): Promise<ComponentID[]> {
    if (!idStr.includes('/')) {
      throw new BitError(`import with wildcards expects full scope-name before the wildcards, instead, got "${idStr}"`);
    }
    const idSplit = idStr.split('/');
    const [scopeName, ...rest] = idSplit;
    const namespacesUsingWildcards = rest.join('/');
    const listResult = await this.remoteList(scopeName, { namespacesUsingWildcards, includeDeprecated });
    if (!listResult.length) {
      throw new NoIdMatchWildcard([idStr]);
    }
    return listResult.map((result) => result.id);
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
    return componentsList.listAll(showRemoteVersion, showAll, namespacesUsingWildcards);
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain, workspace]: [CLIMain, LoggerMain, Workspace]) {
    const logger = loggerMain.createLogger(ListerAspect.id);
    const lister = new ListerMain(logger, workspace);
    cli.register(new ListCmd(lister));
    return lister;
  }
}

ListerAspect.addRuntime(ListerMain);
