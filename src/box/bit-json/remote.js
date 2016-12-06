/** @flow */
import { filter, contains, empty, cleanBang, forEach, prependBang } from '../../utils';
import { PrimaryNotFound, PrimaryOverloaded } from './exceptions';

function listOthers(remotes: {[string]: string}): {[string]: string} {
  return filter(remotes, (host, alias) => isPrimary(alias));
}

function getPrimary(remotes: {[string]: string}): [string, string] {
  let primary = null;

  forEach(remotes, (host, alias) => {
    if (isPrimary(alias) && primary) throw new PrimaryOverloaded();      
    else if (isPrimary(alias)) primary = [cleanBang(alias), host];
  });

  if (!primary) throw new PrimaryNotFound();
  return primary;
}

function isPrimary(alias: string): boolean {
  return contains(alias, '!');
}

export default class Remote {
  primary: ?[string, string];
  others: {[string]: string};

  constructor(primary: ?[string, string], others: {[string]: string} = {}) {
    this.primary = primary;
    this.others = others;
  }

  set(alias: string, host: string, primary: boolean = false): Remote {
    if (primary) this.primary = [alias, host];
    else this.others[alias] = host;
    return this;
  }

  get(alias: string): string {
    return this.others[alias];
  }
  
  toObject(): {[string]: string} {
    const remotes = {};
    if (this.primary) {
      const [primaryAlias, primaryRemote] = this.primary;
      remotes[prependBang(primaryAlias)] = primaryRemote;       
    }
    
    forEach(this.others, (val, key) => {
      remotes[key] = val;
    });
    
    return remotes;
  }

  static load(remotes: {[string]: string}) {
    const primary = getPrimary(remotes);
    const others = listOthers(remotes);

    return new Remote(primary, others);    
  }
}
