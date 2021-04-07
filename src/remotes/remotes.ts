import { groupBy, prop } from 'ramda';
import pMap from 'p-map';
import { FETCH_OPTIONS } from '../api/scope/lib/fetch';
import { BitId } from '../bit-id';
import GlobalRemotes from '../global-config/global-remotes';
import logger from '../logger/logger';
import { ScopeNotFound } from '../scope/exceptions';
import DependencyGraph from '../scope/graph/scope-graph';
import Scope from '../scope/scope';
import { flatten, forEach, prependBang } from '../utils';
import { PrimaryOverloaded } from './exceptions';
import Remote from './remote';
import remoteResolver from './remote-resolver/remote-resolver';
import { UnexpectedNetworkError } from '../scope/network/exceptions';
import { ObjectItemsStream } from '../scope/objects/object-list';
import { concurrentFetchLimit } from '../utils/concurrency';

export default class Remotes extends Map<string, Remote> {
  constructor(remotes: [string, Remote][] = []) {
    super(remotes);
  }

  validate() {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const primary = this.values.filter((remote) => remote.primary);
    if (primary.length > 1) throw new PrimaryOverloaded();
    return this.forEach((remote) => remote.validate());
  }

  async resolve(scopeName: string, thisScope?: Scope | undefined): Promise<Remote> {
    const remote = super.get(scopeName);
    if (remote) return Promise.resolve(remote);
    const scopeHost = await remoteResolver(scopeName, thisScope);
    return new Remote(scopeHost, scopeName, undefined, thisScope?.name);
  }

  isHub(scope: string): boolean {
    // if a scope is listed as a remote, it doesn't go to the hub
    return !this.get(scope);
  }

  async fetch(
    idsGroupedByScope: { [scopeName: string]: string[] }, // option.type determines the id: component-id/lane-id/object-id (hash)
    thisScope: Scope,
    options: Partial<FETCH_OPTIONS> = {},
    context?: Record<string, any>
  ): Promise<{ [remoteName: string]: ObjectItemsStream }> {
    const fetchOptions: FETCH_OPTIONS = {
      type: 'component',
      withoutDependencies: true,
      includeArtifacts: false,
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
        const remote = await this.resolve(scopeName, thisScope);
        let objectsStream: ObjectItemsStream;
        try {
          objectsStream = await remote.fetch(idsGroupedByScope[scopeName], fetchOptions, context);
          objectsStreamPerRemote[scopeName] = objectsStream;
          return objectsStream;
        } catch (err) {
          if (err instanceof ScopeNotFound && !shouldThrowOnUnavailableScope) {
            logger.error(`failed accessing the scope "${scopeName}". continuing without this scope.`);
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

  async latestVersions(ids: BitId[], thisScope: Scope): Promise<BitId[]> {
    const groupedIds = this._groupByScopeName(ids);

    const promises = Object.entries(groupedIds).map(([scopeName, scopeIds]) =>
      this.resolve(scopeName, thisScope).then((remote) => remote.latestVersions(scopeIds))
    );

    const components = await Promise.all(promises);
    const flattenComponents = flatten(components);
    return flattenComponents.map((componentId) => BitId.parse(componentId, true));
  }

  /**
   * returns scope graphs of the given bit-ids.
   * it is possible to improve it by returning only the connected-graph of the given id and not the
   * entire scope graph. however, when asking for multiple ids in the same scope, which is more
   * likely to happen, it'll harm the performance.
   */
  async scopeGraphs(ids: BitId[], thisScope: Scope): Promise<DependencyGraph[]> {
    const groupedIds = this._groupByScopeName(ids);
    const graphsP = Object.keys(groupedIds).map(async (scopeName) => {
      const remote = await this.resolve(scopeName, thisScope);
      const dependencyGraph = await remote.graph();
      dependencyGraph.setScopeName(scopeName);
      return dependencyGraph;
    });
    return Promise.all(graphsP);
  }

  _groupByScopeName(ids: BitId[]) {
    const byScope = groupBy(prop('scope'));
    return byScope(ids) as { [scopeName: string]: BitId[] };
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

  static async getScopeRemote(scopeName: string): Promise<Remote> {
    const remotes = await Remotes.getGlobalRemotes();
    return remotes.resolve(scopeName);
  }

  static async getGlobalRemotes(): Promise<Remotes> {
    const globalRemotes = await GlobalRemotes.load();
    const remotes = globalRemotes.toPlainObject();
    return Remotes.load(remotes);
  }

  static load(remotes: { [key: string]: string }, thisScope?: Scope): Remotes {
    const models = [];

    if (!remotes) return new Remotes();

    forEach(remotes, (name, host) => {
      const remote = Remote.load(name, host, thisScope);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      models.push([remote.name, remote]);
    });

    return new Remotes(models);
  }
}
