import groupArray from 'group-array';
import { groupBy, prop } from 'ramda';
import { BitId } from '../bit-id';
import Remote from './remote';
import { forEach, prependBang, flatten } from '../utils';
import { PrimaryOverloaded } from './exceptions';
import remoteResolver from './remote-resolver/remote-resolver';
import GlobalRemotes from '../global-config/global-remotes';
import Scope from '../scope/scope';
import logger from '../logger/logger';
import DependencyGraph from '../scope/graph/scope-graph';
import CompsAndLanesObjects from '../scope/comps-and-lanes-objects';
import { RemoteLaneId } from '../lane-id/lane-id';

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

  isHub(scope) {
    // if a scope is listed as a remote, it doesn't go to the hub
    return !this.get(scope);
  }

  async fetch(
    ids: BitId[] | RemoteLaneId[],
    thisScope: Scope,
    withoutDeps = false,
    context?: Record<string, any>,
    idsAreLanes = false
  ): Promise<CompsAndLanesObjects> {
    // TODO - Transfer the fetch logic into the ssh module,
    // in order to close the ssh connection in the end of the multifetch instead of one fetch
    const groupedIds = groupArray(ids, 'scope');
    const promises = [];
    forEach(groupedIds, (scopeIds, scopeName) => {
      promises.push(
        // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
        this.resolve(scopeName, thisScope).then((remote) =>
          remote.fetch(scopeIds, withoutDeps, context, undefined, idsAreLanes)
        )
      );
    });

    logger.debug(`[-] Running fetch (withoutDeps: ${withoutDeps.toString()}) (idsAreLane: ${idsAreLanes}) on a remote`);
    const manyCompsAndLanesObjects: CompsAndLanesObjects[] = await Promise.all(promises);
    logger.debug('[-] Returning from a remote');

    return CompsAndLanesObjects.flatten(manyCompsAndLanesObjects);
  }

  async latestVersions(ids: BitId[], thisScope: Scope): Promise<BitId[]> {
    const groupedIds = this._groupByScopeName(ids);
    const promises = [];
    forEach(groupedIds, (scopeIds, scopeName) => {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      promises.push(this.resolve(scopeName, thisScope).then((remote) => remote.latestVersions(scopeIds)));
    });
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

  _groupByScopeName(ids: BitId[]): { [scopeName: string]: BitId[] } {
    const byScope = groupBy(prop('scope'));
    return byScope(ids);
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
