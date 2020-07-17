import { BitIds, BitId } from '../../bit-id';
import { ScopeDescriptor } from '../scope';
import Component from '../../consumer/component';
import { ListScopeResult } from '../../consumer/component/components-list';
import DependencyGraph from '../graph/scope-graph';
import { SSHConnectionStrategyName } from './ssh/ssh';
import { ComponentLogs } from '../models/model-component';
import { LaneData } from '../lanes/lanes';
import CompsAndLanesObjects from '../comps-and-lanes-objects';
import { RemoteLaneId } from '../../lane-id/lane-id';

export interface Network {
  // @todo: this causes ts errors in the ssh class for some reason
  // connect(host: string): Promise<any>;
  close(): void;
  describeScope(): Promise<ScopeDescriptor>;
  deleteMany(ids: string[], force: boolean, context: Record<string, any>, idsAreLanes: boolean);
  fetch(ids: BitId[] | RemoteLaneId[]): Promise<CompsAndLanesObjects>;
  list(namespacesUsingWildcards?: string, strategiesNames?: SSHConnectionStrategyName[]): Promise<ListScopeResult[]>;
  search(query: string, reindex: boolean): Promise<string>;
  show(bitId: BitId): Promise<Component | null | undefined>;
  deprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]>;
  undeprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]>;
  log(id: BitId): Promise<ComponentLogs>;
  latestVersions(bitIds: BitIds): Promise<string[]>;
  graph(bitId?: BitId): Promise<DependencyGraph>;
  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]>;
}
