import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ComponentID } from '@teambit/component-id';
import { ConsumerNotFound } from '@teambit/legacy.consumer';
import type { Remote } from '@teambit/scope.remotes';
import { getRemoteByName } from '@teambit/scope.remotes';
import { ComponentsList } from '@teambit/legacy.component-list';
import { BitError } from '@teambit/bit-error';
import { ListCmd } from './list.cmd';
import { ListerAspect } from './lister.aspect';
import { NoIdMatchWildcard } from './no-id-match-wildcard';

const BEFORE_REMOTE_LIST = 'listing remote components';
const BEFORE_LOCAL_LIST = 'listing components';

export type ListScopeResult = {
  id: ComponentID;
  currentlyUsedVersion?: string | null | undefined;
  remoteVersion?: string;
  deprecated?: boolean;
  removed?: boolean;
  laneReadmeOf?: string[];
};

export class ListerMain {
  constructor(
    private logger: Logger,
    private workspace?: Workspace
  ) {}

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
    const results = includeDeprecated ? listResult : listResult.filter((r) => !r.deprecated);
    return this.sortListScopeResults(results);
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
    namespacesUsingWildcards?: string,
    scopeName?: string
  ): Promise<ListScopeResult[]> {
    if (!this.workspace) {
      throw new ConsumerNotFound();
    }
    this.logger.setStatusLine(BEFORE_LOCAL_LIST);
    const componentsList = new ComponentsList(this.workspace);
    let results = await componentsList.listAll(showRemoteVersion, showAll, namespacesUsingWildcards);
    if (scopeName) {
      results = results.filter((result) => result.id.scope === scopeName);
    }
    return this.sortListScopeResults(results);
  }

  private sortListScopeResults(listScopeResults: ListScopeResult[]): ListScopeResult[] {
    return listScopeResults.sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
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
