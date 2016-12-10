/** @flow */
import Bit from '../bit';
import { contains, isBitUrl, cleanBang } from '../utils';
import { connect } from '../network';
import { InvalidRemote } from './exceptions';

/**
 * @ctx bit, primary, remote
 */
function isPrimary(alias: string): boolean {
  return contains(alias, '!');
}

export default class Remote {
  primary: boolean = false;
  host: string;
  alias: string; 

  constructor(alias: string, host: string, primary: boolean = false) {
    this.alias = alias;
    this.host = host;
    this.primary = primary;
  }

  validate() {
    if (!isBitUrl(this.host)) throw new InvalidRemote();
  }

  connect() {
  }

  push(bit: Bit) {
    const network = connect(this.host);
    network.push(bit.toTar());
  }

  static load(alias: string, host: string): Remote {
    const primary = isPrimary(alias);
    if (primary) alias = cleanBang(alias);

    return new Remote(alias, host, primary); 
  }
}
