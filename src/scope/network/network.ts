import { BitId, BitIds } from '../../bit-id';
import Component from '../../consumer/component';
import { ListScopeResult } from '../../consumer/component/components-list';
import { RemoteLaneId } from '../../lane-id/lane-id';
import CompsAndLanesObjects from '../comps-and-lanes-objects';
import DependencyGraph from '../graph/scope-graph';
import { LaneData } from '../lanes/lanes';
import { ComponentLogs } from '../models/model-component';
import { ScopeDescriptor } from '../scope';
import { SSHConnectionStrategyName } from './ssh/ssh';

export interface Network {
  // @todo: this causes ts errors in the ssh class for some reason
  // connect(host: string): Promise<any>;
  close(): void;
  describeScope(): Promise<ScopeDescriptor>;
  deleteMany(ids: string[], force: boolean, context: Record<string, any>, idsAreLanes: boolean);
  fetch(ids: BitId[] | RemoteLaneId[]): Promise<CompsAndLanesObjects>;
  list(namespacesUsingWildcards?: string, strategiesNames?: SSHConnectionStrategyName[]): Promise<ListScopeResult[]>;
  show(bitId: BitId): Promise<Component | null | undefined>;
  deprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]>;
  undeprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]>;
  log(id: BitId): Promise<ComponentLogs>;
  latestVersions(bitIds: BitIds): Promise<string[]>;
  graph(bitId?: BitId): Promise<DependencyGraph>;
  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]>;
}
