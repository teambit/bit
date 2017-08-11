/** @flow */
import { groupBy, prop } from 'ramda';
import { BitId } from '../bit-id';
import Remote from './remote';
import { forEach, prependBang, flatten } from '../utils';
import { PrimaryOverloaded } from './exceptions';
import ComponentObjects from '../scope/component-objects';
import remoteResolver from './remote-resolver/remote-resolver';
import { GlobalRemotes } from '../global-config';
import Scope from '../scope/scope';
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
    return remoteResolver(scopeName, thisScope)
      .then((scopeHost) => {
        return new Remote(scopeHost, scopeName);
      });
  }

  async fetch(ids: BitId[], thisScope: Scope, withoutDeps: boolean = false): Promise<ComponentObjects[]> {
    // TODO - Transfer the fetch logic into the ssh module,
    // in order to close the ssh connection in the end of the multifetch instead of one fetch
    const byScope = groupBy(prop('scope'));
    const promises = [];
    forEach(byScope(ids), (scopeIds, scopeName) => {
      if (!withoutDeps) {
        promises.push(
          this.resolve(scopeName, thisScope)
            .then(remote => remote.fetch(scopeIds))
        );
      } else {
        promises.push(
          this.resolve(scopeName, thisScope)
            .then(remote => remote.fetchOnes(scopeIds)));
      }
    });

    logger.debug('[-] Running fetch or fetchOnes on a remote');
    const bits = await Promise.all(promises);
    logger.debug('[-] Returning from a remote');
    return flatten(bits);
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

  static load(remotes: {[string]: string}): Remotes {
    const models = [];

    if (!remotes) return new Remotes();

    forEach(remotes, (name, host) => {
      const remote = Remote.load(name, host);
      models.push([remote.name, remote]);
    });

    return new Remotes(models);
  }
}
