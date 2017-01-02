/** @flow */
import Bit from '../bit';
import { contains, isBitUrl, cleanBang } from '../utils';
import { connect } from '../network';
import { InvalidRemote } from './exceptions';
import { BitId } from '../bit-id';

/**
 * @ctx bit, primary, remote
 */
function isPrimary(alias: string): boolean {
  return contains(alias, '!');
}

export default class Remote {
  primary: boolean = false;
  host: string;
  name: ?string;

  constructor(host: string, name: string, primary: boolean = false) {
    this.name = name || null;
    this.host = host;
    this.primary = primary;
  }

  connect(): Promise<Remote> {
    return connect(this.host);
  }

  toPlainObject() {
    return {
      host: this.host,
      name: this.name
    };
  }

  scope(): Promise<{ name: string }> {
    return this.connect().then((network) => {
      return network.describeScope();
    });
  }

  fetch(bitIds: BitId[]): {name: string, contents: Buffer}[] {
    return this
      .connect()
      .then(network => network.fetch(bitIds));
  }

  validate() {
    if (!isBitUrl(this.host)) throw new InvalidRemote();
  }

  push(bit: Bit) {
    connect(this.host).then((network) => {
      return network.push(bit);
    });
  }

  static load(name: string, host: string): Remote {
    const primary = isPrimary(name);
    if (primary) name = cleanBang(name);

    return new Remote(name, host, primary); 
  }
}
