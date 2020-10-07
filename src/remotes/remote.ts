import { FETCH_OPTIONS } from '../api/scope/lib/fetch';
import { BitId } from '../bit-id';
import { ListScopeResult } from '../consumer/component/components-list';
import Component from '../consumer/component/consumer-component';
import logger from '../logger/logger';
import ComponentObjects from '../scope/component-objects';
import DependencyGraph from '../scope/graph/scope-graph';
import { LaneData } from '../scope/lanes/lanes';
import { ComponentLogs } from '../scope/models/model-component';
import { connect } from '../scope/network';
import { Network } from '../scope/network/network';
import { DEFAULT_READ_STRATEGIES, SSHConnectionStrategyName } from '../scope/network/ssh/ssh';
import { ObjectList } from '../scope/objects/object-list';
import { cleanBang, isBitUrl } from '../utils';
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

  constructor(host: string, name?: string, primary = false) {
    this.name = name || '';
    this.host = host;
    this.primary = primary;
  }

  connect(strategiesNames?: SSHConnectionStrategyName[]): Promise<Network> {
    return connect(this.host, strategiesNames);
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

  list(
    namespacesUsingWildcards?: string,
    strategiesNames: SSHConnectionStrategyName[] = DEFAULT_READ_STRATEGIES
  ): Promise<ListScopeResult[]> {
    return this.connect(strategiesNames).then((network) => network.list(namespacesUsingWildcards));
  }

  show(
    bitId: BitId,
    strategiesNames: SSHConnectionStrategyName[] = DEFAULT_READ_STRATEGIES
  ): Promise<Component | null | undefined> {
    return this.connect(strategiesNames).then((network) => network.show(bitId));
  }

  graph(
    bitId?: BitId,
    strategiesNames: SSHConnectionStrategyName[] = DEFAULT_READ_STRATEGIES
  ): Promise<DependencyGraph> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.connect(strategiesNames).then((network) => network.graph(bitId));
  }

  fetch(
    ids: string[],
    fetchOptions: FETCH_OPTIONS,
    context?: Record<string, any>,
    strategiesNames: SSHConnectionStrategyName[] = DEFAULT_READ_STRATEGIES
  ): Promise<ObjectList> {
    return this.connect(strategiesNames).then((network) => network.fetch(ids, fetchOptions, context));
  }

  latestVersions(
    bitIds: BitId[],
    strategiesNames: SSHConnectionStrategyName[] = DEFAULT_READ_STRATEGIES
  ): Promise<string[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.connect(strategiesNames).then((network) => network.latestVersions(bitIds));
  }

  validate() {
    if (!isBitUrl(this.host)) throw new InvalidRemote();
  }

  push(componentObjects: ComponentObjects): Promise<ComponentObjects> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return connect(this.host).then((network) => network.push(componentObjects));
  }

  async pushMany(objectList: ObjectList, context?: Record<string, any>): Promise<string[]> {
    const network = await connect(this.host);
    logger.debug(`[-] Running pushMany on a remote`);
    const results = await network.pushMany(objectList, context);
    logger.debug('[-] Returning from a remote');
    return results;
  }
  deleteMany(
    ids: string[],
    force: boolean,
    context: Record<string, any> | null | undefined,
    idsAreLanes = false
  ): Promise<Record<string, any>> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return connect(this.host).then((network) => network.deleteMany(ids, force, context, idsAreLanes));
  }
  deprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]> {
    return connect(this.host).then((network) => network.deprecateMany(ids, context));
  }
  undeprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]> {
    return connect(this.host).then((network) => network.undeprecateMany(ids, context));
  }
  log(id: BitId): Promise<ComponentLogs> {
    return connect(this.host).then((network) => network.log(id));
  }
  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]> {
    return connect(this.host).then((network) => network.listLanes(name, mergeData));
  }

  static load(name: string, host: string): Remote {
    const primary = isPrimary(name);
    if (primary) name = cleanBang(name);

    return new Remote(name, host, primary);
  }
}
