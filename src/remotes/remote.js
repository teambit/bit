/** @flow */
import Bit from '../bit';
import { contains, isBitUrl, cleanBang } from '../utils';
import { connect } from '../network';
import { InvalidRemote } from './exceptions';
import { BitId } from '../bit-id';
import { Scope } from '../scope';

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
  origin: Scope;

  constructor(alias: string, host: string, primary: boolean = false, origin: Scope) {
    this.alias = alias;
    this.host = host;
    this.primary = primary;
    this.origin = origin;
  }

  connect(): Remote {
    return connect(this.host);
  }

  fetch(bitIds: BitId[]): {name: string, contents: Buffer}[] {
    return this
      .connect()
      .fetch(
        bitIds.map(bitId => bitId.name)
      );
  }

  validate() {
    if (!isBitUrl(this.host)) throw new InvalidRemote();
  }

  push(bit: Bit) {
    const network = connect(this.host);
    return network.push(bit);
  }

  static load(alias: string, host: string): Remote {
    const primary = isPrimary(alias);
    if (primary) alias = cleanBang(alias);

    return new Remote(alias, host, primary); 
  }
}
