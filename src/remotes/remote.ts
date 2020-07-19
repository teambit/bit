import { isBitUrl, cleanBang } from '../utils';
import ComponentObjects from '../scope/component-objects';
import { connect } from '../scope/network';
import { InvalidRemote } from './exceptions';
import { BitId } from '../bit-id';
import { Network } from '../scope/network/network';
import Component from '../consumer/component/consumer-component';
import { ListScopeResult } from '../consumer/component/components-list';
import { SSHConnectionStrategyName, DEFAULT_READ_STRATEGIES } from '../scope/network/ssh/ssh';
import DependencyGraph from '../scope/graph/scope-graph';
import CompsAndLanesObjects from '../scope/comps-and-lanes-objects';
import { ComponentLogs } from '../scope/models/model-component';
import { LaneData } from '../scope/lanes/lanes';
import { RemoteLaneId } from '../lane-id/lane-id';

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

  search(query: string, reindex: boolean): Promise<any> {
    return this.connect().then((network) => network.search(query, reindex));
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
    ids: BitId[] | RemoteLaneId[],
    withoutDeps: boolean,
    context?: Record<string, any>,
    strategiesNames: SSHConnectionStrategyName[] = DEFAULT_READ_STRATEGIES,
    idsAreLanes = false
  ): Promise<CompsAndLanesObjects> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return this.connect(strategiesNames).then((network) => network.fetch(ids, withoutDeps, idsAreLanes, context));
  }

  latestVersions(
    bitIds: BitId[],
    strategiesNames: SSHConnectionStrategyName[] = DEFAULT_READ_STRATEGIES
  ): Promise<ComponentObjects[]> {
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

  pushMany(components: CompsAndLanesObjects, context: Record<string, any> | null | undefined): Promise<string[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return connect(this.host).then((network) => network.pushMany(components, context));
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
