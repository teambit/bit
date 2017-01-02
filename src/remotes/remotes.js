/** @flow */
import Remote from './remote';
import { forEach, prependBang } from '../utils';
import { PrimaryOverloaded, RemoteNotFound } from './exceptions';

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
