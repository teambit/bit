import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import type { ComponentID } from '@teambit/component-id';
import { ConsumerNotFound } from '@teambit/legacy.consumer';
import type { Remote } from '@teambit/scope.remotes';
import { getRemoteByName, listScopesByOwner } from '@teambit/scope.remotes';
import { ComponentsList } from '@teambit/legacy.component-list';
import { BitError } from '@teambit/bit-error';
import { pMapPool } from '@teambit/toolbox.promise.map-pool';
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
      skipStatusLine = false,
    }: {
      namespacesUsingWildcards?: string;
      includeDeprecated?: boolean;
      includeDeleted?: boolean;
      skipStatusLine?: boolean;
    }
  ): Promise<ListScopeResult[]> {
    const remote: Remote = await getRemoteByName(scopeName, this.workspace?.consumer);
    if (!skipStatusLine) {
      this.logger.setStatusLine(BEFORE_REMOTE_LIST);
    }
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

  /**
   * Get all component IDs from all scopes owned by a specific owner, grouped by scope.
   * This is used with the --owner flag, e.g., `bit import teambit --owner`.
   * Returns a map of scopeName -> componentIds, allowing the caller to handle each scope separately.
   */
  async getRemoteCompIdsByOwnerGrouped(
    owner: string,
    includeDeprecated = true
  ): Promise<{
    scopeIds: Map<string, ComponentID[]>;
    failedScopes: string[];
    failedScopesErrors: Map<string, string>;
  }> {
    this.logger.setStatusLine(`fetching scopes for owner "${owner}"`);
    const scopes = await listScopesByOwner(owner);

    if (!scopes.length) {
      throw new BitError(`no scopes found for owner "${owner}"`);
    }

    const totalScopes = scopes.length;
    this.logger.setStatusLine(`found ${totalScopes} scopes for owner "${owner}", fetching components...`);

    const scopeIds = new Map<string, ComponentID[]>();
    const failedScopes: string[] = [];
    const failedScopesErrors = new Map<string, string>();

    await pMapPool(
      scopes,
      async (scopeName) => {
        try {
          const listResult = await this.remoteList(scopeName, {
            namespacesUsingWildcards: '**',
            includeDeprecated,
            skipStatusLine: true,
          });
          const ids = listResult.map((result) => result.id);
          if (ids.length) {
            scopeIds.set(scopeName, ids);
          }
        } catch (err: any) {
          failedScopes.push(scopeName);
          failedScopesErrors.set(scopeName, this.extractErrorMessage(err));
        }
      },
      {
        concurrency: 10,
        onCompletedChunk: (completed) => {
          this.logger.setStatusLine(`fetching components: ${completed}/${totalScopes} scopes completed`);
        },
      }
    );

    if (!scopeIds.size) {
      throw new NoIdMatchWildcard([`${owner}/**`]);
    }

    return { scopeIds, failedScopes, failedScopesErrors };
  }

  private extractErrorMessage(err: any): string {
    // GraphQL client errors have response.errors array
    if (err.response?.errors?.length) {
      return err.response.errors.map((e: any) => e.message).join('; ');
    }
    // Sometimes the error message itself is JSON stringified
    const msg = err.message || String(err);
    if (msg.startsWith('{')) {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.response?.errors?.length) {
          return parsed.response.errors.map((e: any) => e.message).join('; ');
        }
      } catch {
        // Not valid JSON, return as-is
      }
    }
    return msg;
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
