/** @flow */
import Bit from '../consumer/component';
import { contains, isBitUrl, cleanBang, allSettled } from '../utils';
import ComponentObjects from '../scope/component-objects';
import { connect } from '../scope/network';
import { InvalidRemote } from './exceptions';
import { BitId, BitIds } from '../bit-id';
import { get as getCache } from '../cache';
import VersionDependencies from '../scope/version-dependencies';
import type { Network } from '../scope/network/network';
import { CacheNotFound } from '../cache/exceptions';

/**
 * @ctx bit, primary, remote
 */
function isPrimary(alias: string): boolean {
  return contains(alias, '!');
}

export default class Remote {
  primary: boolean = false;
  host: string;
  name: string;

  constructor(host: string, name: ?string, primary: boolean = false) {
    this.name = name || '';
    this.host = host;
    this.primary = primary;
  }

  connect(): Promise<Network> {
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
  
  list(): Promise<[]> {
    return this
      .connect()
      .then(network => network.list());
  }

  show(): Promise<> {

  }

  fetch(bitIds: BitId[]): Promise<ComponentObjects[]> {
    return this
      .connect()
      .then(network => network.fetch(bitIds));
  }

  fetchOnes(ids: BitIds): Promise<ComponentObjects[]> {
    return this
      .connect()
      .then(network => network.fetch(ids, true));
  }

  validate() {
    if (!isBitUrl(this.host)) throw new InvalidRemote();
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return connect(this.host)
    .then(network => network.push(componentObjects));
  }

  static load(name: string, host: string): Remote {
    const primary = isPrimary(name);
    if (primary) name = cleanBang(name);

    return new Remote(name, host, primary); 
  }
}
