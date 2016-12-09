/** @flow */
import Remote from './remote';
import { forEach, prependBang } from '../utils';
import { PrimaryOverloaded } from './exceptions';

export default class Remotes extends Map<string, Remote> {
  constructor(remotes: [string, Remote][] = []) {
    super(remotes);
  }

  validate() {
    const primary = this.values.filter(remote => remote.primary);
    if (primary.length > 1) throw new PrimaryOverloaded();
    return this.forEach(remote => remote.validate());
  }

  toPlainObject() {
    const object = {};

    this.forEach((remote) => {
      let alias = remote.alias;
      if (remote.primary) alias = prependBang(remote.alias); 
      object[alias] = remote.host;
    });

    return object;
  }

  static load(remotes: {[string]: string}): Remotes {
    const models = [];
    
    forEach(remotes, (host, alias) => {
      const remote = Remote.load(alias, host); 
      models.push([remote.alias, remote]);
    });

    return new Remotes(models);
  }
}
