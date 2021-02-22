import { groupBy, prop } from 'ramda';
import pMap from 'p-map';
import { FETCH_OPTIONS } from '../api/scope/lib/fetch';
import { BitId } from '../bit-id';
import GlobalRemotes from '../global-config/global-remotes';
import logger from '../logger/logger';
import { ScopeNotFound } from '../scope/exceptions';
import DependencyGraph from '../scope/graph/scope-graph';
import { ObjectList } from '../scope/objects/object-list';
import Scope from '../scope/scope';
import { flatten, forEach, prependBang } from '../utils';
import { PrimaryOverloaded } from './exceptions';
import Remote from './remote';
import remoteResolver from './remote-resolver/remote-resolver';
import { CONCURRENT_FETCH_LIMIT } from '../constants';
import { UnexpectedNetworkError } from '../scope/network/exceptions';

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

  resolve(scopeName: string, thisScope?: Scope | null | undefined): Promise<Remote> {
    const remote = super.get(scopeName);
    if (remote) return Promise.resolve(remote);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return remoteResolver(scopeName, thisScope).then((scopeHost) => {
      return new Remote(scopeHost, scopeName);
    });
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
  ): Promise<{ objectList: ObjectList; objectListPerRemote: { [remoteName: string]: ObjectList } }> {
    const fetchOptions: FETCH_OPTIONS = {
      type: 'component',
      withoutDependencies: false,
      includeArtifacts: false,
      ...options,
    };
    logger.debug('[-] Running fetch on remotes, with the following options', fetchOptions);
    // when importing directly from a remote scope, throw for ScopeNotFound. otherwise, when
    // fetching flattened dependencies (withoutDependencies=true), ignore this error
    const shouldThrowOnUnavailableScope = !fetchOptions.withoutDependencies;
    const objectListPerRemote = {};
    const failedScopes: { [scopeName: string]: Error } = {};
    const objectLists: ObjectList[] = await pMap(
      Object.keys(idsGroupedByScope),
      async (scopeName) => {
        const remote = await this.resolve(scopeName, thisScope);
        let objectList: ObjectList;
        try {
          objectList = await remote.fetch(idsGroupedByScope[scopeName], fetchOptions, context);
        } catch (err) {
          if (err instanceof ScopeNotFound && !shouldThrowOnUnavailableScope) {
            logger.error(`failed accessing the scope "${scopeName}". continuing without this scope.`);
            objectList = new ObjectList();
          } else if (err instanceof UnexpectedNetworkError) {
            logger.error(`failed fetching from ${scopeName}`, err);
            failedScopes[scopeName] = err;
            objectList = new ObjectList();
          } else {
            throw err;
          }
        }
        objectListPerRemote[scopeName] = objectList;
        return objectList;
      },
      { concurrency: CONCURRENT_FETCH_LIMIT }
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

    return { objectList: ObjectList.mergeMultipleInstances(objectLists), objectListPerRemote };
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

  static getScopeRemote(scopeName: string): Promise<Remote> {
    return Remotes.getGlobalRemotes().then((remotes) => remotes.resolve(scopeName));
  }

  static getGlobalRemotes(): Promise<Remotes> {
    return GlobalRemotes.load()
      .then((globalRemotes) => globalRemotes.toPlainObject())
      .then((remotes) => Remotes.load(remotes));
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  static load(remotes: { [key: string]: string }): Remotes {
    const models = [];

    if (!remotes) return new Remotes();

    forEach(remotes, (name, host) => {
      const remote = Remote.load(name, host);
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      models.push([remote.name, remote]);
    });

    return new Remotes(models);
  }
}
