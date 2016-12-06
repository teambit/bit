/** @flow */
import { filter, contains, empty, cleanBang, forEach, prependBang } from '../../utils';
import { PrimaryNotFound, PrimaryOverloaded } from './exceptions';

// function listOthers(remotes: {[string]: string}): {[string]: string} {
//   return filter(remotes, (host, alias) => isPrimary(alias));
// }

// function getPrimary(remotes: {[string]: string}): [string, string] {
//   let primary = null;

//   forEach(remotes, (host, alias) => {
//     if (isPrimary(alias) && primary) throw new PrimaryOverloaded();      
//     else if (isPrimary(alias)) primary = [cleanBang(alias), host];
//   });

//   if (!primary) throw new PrimaryNotFound();
//   return primary;
// }

// function isPrimary(alias: string): boolean {
//   return contains(alias, '!');
// }

export default class Remotes {
  remotes: {[string]: string};

  constructor(remotes: {[string]: string} = {}) {
    this.remotes = remotes;
  }

  set(alias: string, host: string): Remotes {
    // if (primary) this.primary = [alias, host];
    this.remotes[alias] = host;
    return this;
  }

  get(alias: string): string {
    return this.remotes[alias];
  }
  
  toObject(): {[string]: string} {
    const remotes = {};
    
    // if (this.primary) {
    //   const [primaryAlias, primaryRemote] = this.primary;
    //   remotes[prependBang(primaryAlias)] = primaryRemote;       
    // }
    
    forEach(this.remotes, (val, key) => {
      remotes[key] = val;
    });
    
    return remotes;
  }

  static load(remotes: {[string]: string}) {
    // const primary = getPrimary(remotes);
    // const remotes = listOthers(remotes);

    return new Remotes(remotes);    
  }
}
