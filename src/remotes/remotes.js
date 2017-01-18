/** @flow */
import { groupBy, prop } from 'ramda';
import { BitId } from '../bit-id';
import Remote from './remote';
import { forEach, prependBang, flatten } from '../utils';
import { PrimaryOverloaded, RemoteNotFound } from './exceptions';
import ComponentObjects from '../scope/component-objects';
import { REMOTE_ALIAS_SIGN } from '../constants';
import remotesResolver from './remote-resolver/remote-resolver';
import Scope from '../scope/scope';

export default class Remotes extends Map<string, Remote> {
  constructor(remotes: [string, Remote][] = []) {
    super(remotes);
  }

  validate() {
    const primary = this.values.filter(remote => remote.primary);
    if (primary.length > 1) throw new PrimaryOverloaded();
    return this.forEach(remote => remote.validate());
  }

  get(name: string): Remote {
    const remote = super.get(name);
    if (!remote) throw new RemoteNotFound(name);
    return remote;
  }

  resolve(scopeName: string, thisScope: Scope): Promise<Remote> {
    if (scopeName.startsWith(REMOTE_ALIAS_SIGN)) {
      return Promise.resolve(
        this.get(scopeName.replace(REMOTE_ALIAS_SIGN, ''))
      );
    }
    
    return remotesResolver(scopeName, thisScope)
    .then((scopeHost) => {
      return new Remote(scopeHost, scopeName); 
    });
  }

  fetch(ids: BitId[], thisScope: Scope, withoutDeps: boolean = false):
  Promise<ComponentObjects[]> {
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
          .then(remote => remote.fetchOnes(scopeIds))
          );
      }
    });

    return Promise.all(promises)
      .then(bits => flatten(bits));
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
