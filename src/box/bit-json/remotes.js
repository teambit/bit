/** @flow */
import Remote from './remote';
import { forEach, prependBang } from '../../utils';
import { PrimaryOverloaded } from './exceptions';

export default class Remotes extends Array<Remote> {
  constructor(remotes: Remote[] = []) {
    super(...remotes);
  }

  validate() {
    const primary = this.filter(remote => remote.primary);
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
      models.push(Remote.load(alias, host));
    });

    return new Remotes(models);
  }
}
