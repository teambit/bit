import { groupBy, prop } from 'ramda';
import { forEach } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import pMap from 'p-map';
import { CURRENT_FETCH_SCHEMA, FETCH_OPTIONS } from '@teambit/legacy.scope-api';
import { GlobalRemotes } from './global-remotes';
import { logger } from '@teambit/legacy.logger';
import { Scope as LegacyScope, ScopeNotFound } from '@teambit/legacy.scope';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import { prependBang } from '@teambit/legacy.utils';
import { concurrentFetchLimit } from '@teambit/harmony.modules.concurrency';
import { PrimaryOverloaded } from './exceptions';
import { Remote } from './remote';
import remoteResolver from './remote-resolver/remote-resolver';
import { UnexpectedNetworkError } from '@teambit/scope.network';
import { ObjectItemsStream } from '@teambit/scope.objects';
import { ScopeNotFoundOrDenied } from './exceptions/scope-not-found-or-denied';

export class Remotes extends Map<string, Remote> {
  constructor(
    remotes: [string, Remote][] = [],
    protected thisScope?: LegacyScope
  ) {
    super(remotes);
  }

  validate() {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const primary = this.values.filter((remote) => remote.primary);
    if (primary.length > 1) throw new PrimaryOverloaded();
    return this.forEach((remote) => remote.validate());
  }

  async resolve(scopeName: string): Promise<Remote> {
    const remote = super.get(scopeName);
    if (remote) return Promise.resolve(remote);
    const scopeHost = await remoteResolver(scopeName, this.thisScope);
    return new Remote(scopeHost, scopeName, undefined, this.thisScope?.name);
  }

  isHub(scope: string): boolean {
    // if a scope is listed as a remote, it doesn't go to the hub
    return !this.get(scope);
  }

  async fetch(
    idsGroupedByScope: { [scopeName: string]: string[] }, // option.type determines the id: component-id/lane-id/object-id (hash)
    options: Partial<FETCH_OPTIONS> = {},
    context?: Record<string, any>
  ): Promise<{ [remoteName: string]: ObjectItemsStream }> {
    const fetchOptions: FETCH_OPTIONS = {
      type: 'component',
      fetchSchema: CURRENT_FETCH_SCHEMA,
      withoutDependencies: true, // backward compatibility. not needed for remotes > 0.0.900
      includeArtifacts: false,
      allowExternal: false,
      ...options,
    };
    logger.debug('[-] Running fetch on remotes, with the following options', fetchOptions);
    // when importing directly from a remote scope, throw for ScopeNotFound. otherwise, when
    // fetching flattened dependencies (withoutDependencies=true), ignore this error
    const shouldThrowOnUnavailableScope = !fetchOptions.withoutDependencies;
    const objectsStreamPerRemote = {};
    const failedScopes: { [scopeName: string]: Error } = {};
    const concurrency = concurrentFetchLimit();
    await pMap(
      Object.keys(idsGroupedByScope),
      async (scopeName) => {
        try {
          const remote = await this.resolve(scopeName);
          const objectsStream = await remote.fetch(idsGroupedByScope[scopeName], fetchOptions, context);
          objectsStreamPerRemote[scopeName] = objectsStream;
          return objectsStream;
        } catch (err: any) {
          if (err instanceof ScopeNotFound || err instanceof ScopeNotFoundOrDenied) {
            const msgPrefix = `failed accessing the scope "${scopeName}", which was needed for the following IDs: ${idsGroupedByScope[
              scopeName
            ].join('\n')}`;
            if (shouldThrowOnUnavailableScope) {
              logger.error(`${msgPrefix}\nstopping the process`);
              throw err;
            } else {
              logger.error(`${msgPrefix}\ncontinuing without this scope.`);
            }
          } else if (err instanceof UnexpectedNetworkError) {
            logger.error(`failed fetching from ${scopeName}`, err);
            failedScopes[scopeName] = err;
          } else {
            throw err;
          }
          return null;
        }
      },
      { concurrency }
    );
    if (Object.keys(failedScopes).length) {
      const failedScopesErr = Object.keys(failedScopes).map(
        (failedScope) => `${failedScope} - ${failedScopes[failedScope].message}`
      );
      throw new Error(`unexpected network error has occurred during fetching scopes: ${Object.keys(failedScopes).join(
        ', '
      )}
server responded with the following error messages:
${failedScopesErr.join('\n')}`);
    }
    logger.debug('[-] Returning from the remotes');

    return objectsStreamPerRemote;
  }

  async latestVersions(ids: ComponentID[]): Promise<ComponentID[]> {
    const groupedIds = this._groupByScopeName(ids);

    const promises = Object.entries(groupedIds).map(([scopeName, scopeIds]) =>
      this.resolve(scopeName).then((remote) => remote.latestVersions(scopeIds))
    );

    const components = await Promise.all(promises);
    const flattenComponents = components.flat();
    return flattenComponents.map((componentId) => ComponentID.fromString(componentId));
  }

  /**
   * returns scope graphs of the given bit-ids.
   * it is possible to improve it by returning only the connected-graph of the given id and not the
   * entire scope graph. however, when asking for multiple ids in the same scope, which is more
   * likely to happen, it'll harm the performance.
   */
  async scopeGraphs(ids: ComponentID[]): Promise<DependencyGraph[]> {
    const groupedIds = this._groupByScopeName(ids);
    const graphsP = Object.keys(groupedIds).map(async (scopeName) => {
      const remote = await this.resolve(scopeName);
      const dependencyGraph = await remote.graph();
      dependencyGraph.setScopeName(scopeName);
      return dependencyGraph;
    });
    return Promise.all(graphsP);
  }

  _groupByScopeName(ids: ComponentID[]) {
    const byScope = groupBy(prop('scope'));
    return byScope(ids) as { [scopeName: string]: ComponentID[] };
  }

  toPlainObject() {
    const object = {};

    this.forEach((remote) => {
      let name = remote.name;
      if (remote.primary) name = prependBang(remote.name);
      object[name] = remote.host;
    });

    return object;
  }

  shouldGoToCentralHub(scopes: string[]): boolean {
    const hubRemotes = scopes.filter((scopeName) => this.isHub(scopeName));
    if (!hubRemotes.length) return false;
    if (hubRemotes.length === scopes.length) return true; // all are hub
    throw new BitError(
      `some of your components are configured to work with a local scope and some to the bit.cloud hub. this is not supported`
    );
  }

  static async getScopeRemote(scopeName: string): Promise<Remote> {
    const remotes = await Remotes.getGlobalRemotes();
    return remotes.resolve(scopeName);
  }

  static async getGlobalRemotes(): Promise<Remotes> {
    const globalRemotes = await GlobalRemotes.load();
    const remotes = globalRemotes.toPlainObject();
    return Remotes.load(remotes);
  }

  static load(remotes: { [key: string]: string }, thisScope?: LegacyScope): Remotes {
    const models = [];

    if (!remotes) return new Remotes(undefined, thisScope);

    forEach(remotes, (name, host) => {
      const remote = Remote.load(name, host, thisScope);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      models.push([remote.name, remote]);
    });

    return new Remotes(models, thisScope);
  }
}
