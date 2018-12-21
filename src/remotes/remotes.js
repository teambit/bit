/** @flow */
import { groupBy, prop } from 'ramda';
import { BitId, BitIds } from '../bit-id';
import Remote from './remote';
import { forEach, prependBang, flatten } from '../utils';
import { PrimaryOverloaded } from './exceptions';
import ComponentObjects from '../scope/component-objects';
import remoteResolver from './remote-resolver/remote-resolver';
import GlobalRemotes from '../global-config/global-remotes';
import type Scope from '../scope/scope';
import logger from '../logger/logger';

export default class Remotes extends Map<string, Remote> {
  constructor(remotes: [string, Remote][] = []) {
    super(remotes);
  }

  validate() {
    const primary = this.values.filter(remote => remote.primary);
    if (primary.length > 1) throw new PrimaryOverloaded();
    return this.forEach(remote => remote.validate());
  }

  resolve(scopeName: string, thisScope?: Scope): Promise<Remote> {
    const remote = super.get(scopeName);
    if (remote) return Promise.resolve(remote);
    return remoteResolver(scopeName, thisScope).then((scopeHost) => {
      return new Remote(scopeHost, scopeName);
    });
  }

  isHub(scope) {
    // if a scope is listed as a remote, it doesn't go to the hub
    return !this.get(scope);
  }

  async fetch(
    ids: BitId[],
    thisScope: Scope,
    withoutDeps: boolean = false,
    context: ?Object
  ): Promise<ComponentObjects[]> {
    // TODO - Transfer the fetch logic into the ssh module,
    // in order to close the ssh connection in the end of the multifetch instead of one fetch
    const byScope = groupBy(prop('scope'));
    const promises = [];
    forEach(byScope(ids), (scopeIds, scopeName) => {
      promises.push(
        this.resolve(scopeName, thisScope).then(remote =>
          remote.fetch(BitIds.fromArray(scopeIds), withoutDeps, context)
        )
      );
    });

    logger.debug(`[-] Running fetch (withoutDeps: ${withoutDeps}) on a remote`);
    const bits = await Promise.all(promises);
    logger.debug('[-] Returning from a remote');
    return flatten(bits);
  }

  async latestVersions(ids: BitId[], thisScope: Scope): Promise<BitId[]> {
    const byScope = groupBy(prop('scope'));
    const promises = [];
    forEach(byScope(ids), (scopeIds, scopeName) => {
      promises.push(this.resolve(scopeName, thisScope).then(remote => remote.latestVersions(scopeIds)));
    });
    const components = await Promise.all(promises);
    const flattenComponents = flatten(components);
    return flattenComponents.map(componentId => BitId.parse(componentId, true));
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
    return GlobalRemotes.load()
      .then(globalRemotes => globalRemotes.toPlainObject())
      .then(remotes => Remotes.load(remotes).resolve(scopeName));
  }

  static load(remotes: { [string]: string }): Remotes {
    const models = [];

    if (!remotes) return new Remotes();

    forEach(remotes, (name, host) => {
      const remote = Remote.load(name, host);
      models.push([remote.name, remote]);
    });

    return new Remotes(models);
  }
}
