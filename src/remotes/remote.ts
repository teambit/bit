import { ComponentID } from '@teambit/component-id';
import { PushOptions, CURRENT_FETCH_SCHEMA, FETCH_OPTIONS } from '@teambit/legacy.scope-api';
import { ListScopeResult } from '@teambit/legacy.component-list';
import Component from '../consumer/component/consumer-component';
import logger from '../logger/logger';
import type { Scope } from '../scope';
import ComponentObjects from '../scope/component-objects';
import DependencyGraph from '../scope/graph/scope-graph';
import { LaneData } from '../scope/lanes/lanes';
import { ComponentLog } from '../scope/models/model-component';
import { connect } from '../scope/network';
import { Network } from '../scope/network/network';
import { ObjectItemsStream, ObjectList } from '../scope/objects/object-list';
import RemovedObjects from '../scope/removed-components';
import { isBitUrl } from '@teambit/legacy.utils';
import { InvalidRemote } from './exceptions';

/**
 * @ctx bit, primary, remote
 */
function isPrimary(alias: string): boolean {
  return alias.includes('!');
}

export default class Remote {
  primary = false;
  host: string;
  name: string;

  constructor(host: string, name?: string, primary = false, private localScopeName?: string) {
    this.name = name || '';
    this.host = host;
    this.primary = primary;
  }

  connect(): Promise<Network> {
    return connect(this.host, this.name, this.localScopeName);
  }

  toPlainObject() {
    return {
      host: this.host,
      name: this.name,
    };
  }

  scope(): Promise<{ name: string }> {
    return this.connect().then((network) => {
      return network.describeScope();
    });
  }

  list(namespacesUsingWildcards?: string, includeDeleted = false): Promise<ListScopeResult[]> {
    return this.connect().then((network) => network.list(namespacesUsingWildcards, includeDeleted));
  }

  show(bitId: ComponentID): Promise<Component | null | undefined> {
    return this.connect().then((network) => network.show(bitId));
  }

  graph(bitId?: ComponentID): Promise<DependencyGraph> {
    return this.connect().then((network) => network.graph(bitId));
  }

  fetch(ids: string[], fetchOptions: FETCH_OPTIONS, context?: Record<string, any>): Promise<ObjectItemsStream> {
    fetchOptions.fetchSchema = CURRENT_FETCH_SCHEMA;
    return this.connect().then((network) => network.fetch(ids, fetchOptions, context));
  }

  latestVersions(bitIds: ComponentID[]): Promise<string[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.connect().then((network) => network.latestVersions(bitIds));
  }

  validate() {
    if (!isBitUrl(this.host)) throw new InvalidRemote();
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.connect().then((network) => network.push(componentObjects));
  }

  async pushMany(objectList: ObjectList, pushOptions: PushOptions, context?: Record<string, any>): Promise<string[]> {
    const network = await this.connect();
    logger.debug(`[-] Running pushMany on a remote, pushOptions: ${JSON.stringify(pushOptions)}`);
    const results = await network.pushMany(objectList, pushOptions, context);
    logger.debug('[-] Returning from a remote');
    return results;
  }
  deleteMany(
    ids: string[],
    force: boolean,
    context: Record<string, any> | null | undefined,
    idsAreLanes = false
  ): Promise<RemovedObjects> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.connect().then((network) => network.deleteMany(ids, force, context, idsAreLanes));
  }
  log(id: ComponentID): Promise<ComponentLog[]> {
    return this.connect().then((network) => network.log(id));
  }
  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]> {
    return this.connect().then((network) => network.listLanes(name, mergeData));
  }
  async hasObjects(hashes: string[]): Promise<string[]> {
    return this.connect().then((network) => network.hasObjects(hashes));
  }
  async action<Options extends Record<string, any>, Result>(name: string, options: Options): Promise<Result> {
    const network = await this.connect();
    logger.debug(`[-] Running action ${name} on a remote ${this.name}, options: ${JSON.stringify(options)}`);
    const results: Result = await network.action(name, options);
    logger.debug(`[-] Returning from running action ${name} on a remote ${this.name}`);
    return results;
  }

  static load(name: string, host: string, thisScope?: Scope): Remote {
    const primary = isPrimary(name);
    if (primary) name = name.replace('!', '');

    return new Remote(name, host, primary, thisScope?.name);
  }
}
