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
import { Http } from '@teambit/scope.network';
import { CENTRAL_BIT_HUB_NAME, SYMPHONY_GRAPHQL } from '@teambit/legacy.constants';
import { parseScope } from '@teambit/legacy.utils';
import { ListCmd } from './list.cmd';
import { SearchCmd } from './search.cmd';
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
  rootDir?: string;
};

export type SearchOptions = {
  owners?: string[];
  skipAutoOwner?: boolean;
  localOnly?: boolean;
  remoteOnly?: boolean;
};

export type SearchResults = {
  remote: string[];
  local: string[];
  perQuery: Array<{ query: string; remoteCount: number; localCount: number; error?: string }>;
  ownersUsed?: string[];
  hasWorkspace: boolean;
  remoteAvailable: boolean;
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
    this.logger.consoleSuccess(`found ${totalScopes} scopes for owner "${owner}"`);
    this.logger.setStatusLine(`fetching component-ids from ${totalScopes} scopes for owner "${owner}"`);
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
      { concurrency: 10 }
    );

    if (!scopeIds.size) {
      throw new NoIdMatchWildcard([`${owner}/**`]);
    }

    const totalComponents = Array.from(scopeIds.values()).reduce((sum, ids) => sum + ids.length, 0);
    this.logger.consoleSuccess(`found ${totalComponents} components across ${scopeIds.size} scopes`);

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
    let results: ListScopeResult[] = await componentsList.listAll(showRemoteVersion, showAll, namespacesUsingWildcards);
    if (scopeName) {
      results = results.filter((result) => result.id.scope === scopeName);
    }
    const bitMap = this.workspace.consumer.bitMap;
    const allComponents = bitMap.getAllComponents();
    const componentMapById = new Map(
      allComponents.map((componentMap) => [componentMap.id.toStringWithoutVersion(), componentMap])
    );
    results.forEach((result) => {
      const componentMap = componentMapById.get(result.id.toStringWithoutVersion());
      if (componentMap) {
        result.rootDir = componentMap.getComponentDir();
      }
    });
    return this.sortListScopeResults(results);
  }

  private sortListScopeResults(listScopeResults: ListScopeResult[]): ListScopeResult[] {
    return listScopeResults.sort((a, b) => a.id.toString().localeCompare(b.id.toString()));
  }

  private _http?: Http;
  private async getHttp(): Promise<Http> {
    if (!this._http) {
      this._http = await Http.connect(SYMPHONY_GRAPHQL, CENTRAL_BIT_HUB_NAME);
    }
    return this._http;
  }

  async search(queries: string[], opts: SearchOptions = {}): Promise<SearchResults> {
    if (!queries.length) throw new BitError('search requires at least one query');
    if (opts.localOnly && opts.remoteOnly) {
      throw new BitError('--local-only and --remote-only cannot be used together');
    }
    if (opts.localOnly && !this.workspace) {
      throw new BitError('--local-only requires a workspace. Run without --local-only to search remote only.');
    }
    const uniqueQueries = [...new Set(queries)];

    let ownersToUse = opts.owners?.length ? opts.owners : undefined;
    if (!ownersToUse && !opts.skipAutoOwner && this.workspace) {
      const owner = parseScope(this.workspace.defaultScope).owner ?? this.workspace.defaultScope;
      if (owner) ownersToUse = [owner];
    }

    const [localIds, http] = await Promise.all([
      !opts.remoteOnly && this.workspace ? this.workspace.listIds().map((id) => id.toStringWithoutVersion()) : [],
      opts.localOnly
        ? undefined
        : this.getHttp().catch((err) => {
            this.logger.warn(`failed to connect to remote: ${this.extractErrorMessage(err)}`);
            return undefined;
          }),
    ]);

    const localIdsLower = localIds.map((id) => id.toLowerCase());

    const perQuery = await Promise.all(
      uniqueQueries.map(async (query) => {
        const lower = query.toLowerCase();
        const localMatches = localIds.filter((_, i) => localIdsLower[i].includes(lower));

        let remoteCount = 0;
        let remoteComponents: string[] = [];
        let error: string | undefined;
        if (http) {
          try {
            const result = await http.search(query, ownersToUse);
            remoteComponents = result?.components || [];
            remoteCount = remoteComponents.length;
          } catch (err: any) {
            error = this.extractErrorMessage(err);
            this.logger.warn(`search failed for query "${query}": ${error}`);
          }
        }

        return { query, remoteCount, localCount: localMatches.length, error, localMatches, remoteComponents };
      })
    );

    const remoteSet = new Set<string>();
    const localSet = new Set<string>();
    for (const result of perQuery) {
      result.remoteComponents.forEach((id) => remoteSet.add(id));
      result.localMatches.forEach((id) => localSet.add(id));
    }

    return {
      remote: Array.from(remoteSet).sort(),
      local: Array.from(localSet).sort(),
      perQuery: perQuery.map(({ query, remoteCount, localCount, error }) => ({
        query,
        remoteCount,
        localCount,
        error,
      })),
      ownersUsed: ownersToUse,
      hasWorkspace: !!this.workspace,
      remoteAvailable: !!http,
    };
  }

  static slots = [];
  static dependencies = [CLIAspect, LoggerAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, loggerMain, workspace]: [CLIMain, LoggerMain, Workspace]) {
    const logger = loggerMain.createLogger(ListerAspect.id);
    const lister = new ListerMain(logger, workspace);
    cli.register(new ListCmd(lister), new SearchCmd(lister));
    return lister;
  }
}

ListerAspect.addRuntime(ListerMain);
