/** @flow */
import { contains, isBitUrl, cleanBang } from '../utils';
import ComponentObjects from '../scope/component-objects';
import { connect } from '../scope/network';
import { InvalidRemote } from './exceptions';
import { BitId } from '../bit-id';
import type { Network } from '../scope/network/network';
import Component from '../consumer/component';

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
    return this.connect().then(network => network.list());
  }

  search(query: string, reindex: boolean): Promise<any> {
    return this.connect().then(network => network.search(query, reindex));
  }

  show(bitId: BitId): Promise<?Component> {
    return this.connect().then(network => network.show(bitId));
  }

  fetch(bitIds: BitId[], withoutDeps: boolean): Promise<ComponentObjects[]> {
    return this.connect().then(network => network.fetch(bitIds, withoutDeps));
  }

  latestVersions(bitIds: BitId[]): Promise<ComponentObjects[]> {
    return this.connect().then(network => network.latestVersions(bitIds));
  }

  validate() {
    if (!isBitUrl(this.host)) throw new InvalidRemote();
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    return connect(this.host).then(network => network.push(componentObjects));
  }

  pushMany(components: ComponentObjects[]): Promise<ComponentObjects[]> {
    return connect(this.host).then(network => network.pushMany(components));
  }
  deleteMany(bitIds: Array<BitIds>, force: boolean): Promise<Object[]> {
    return connect(this.host).then(network => network.deleteMany(bitIds, force));
  }
  deprecateMany(bitIds: BitIds[]): Promise<Object[]> {
    return connect(this.host).then(network => network.deprecateMany(bitIds));
  }

  static load(name: string, host: string): Remote {
    const primary = isPrimary(name);
    if (primary) name = cleanBang(name);

    return new Remote(name, host, primary);
  }
}
