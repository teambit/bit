import { BitIds, BitId } from '../../bit-id';
import ComponentObjects from '../../scope/component-objects';
import { ScopeDescriptor } from '../scope';
import Component from '../../consumer/component';
import { ListScopeResult } from '../../consumer/component/components-list';
import DependencyGraph from '../graph/scope-graph';
import { SSHConnectionStrategyName } from './ssh/ssh';
import { ComponentLogs } from '../models/model-component';

export interface Network {
  connect(host: string): Network;
  close(): void;
  describeScope(): Promise<ScopeDescriptor>;
  fetch(bitIds: BitIds): Promise<ComponentObjects[]>;
  list(namespacesUsingWildcards?: string, strategiesNames?: SSHConnectionStrategyName[]): Promise<ListScopeResult[]>;
  search(query: string, reindex: boolean): Promise<string>;
  show(bitId: BitId): Promise<Component | null | undefined>;
  deprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]>;
  undeprecateMany(ids: string[], context: Record<string, any> | null | undefined): Promise<Record<string, any>[]>;
  log(id: BitId): Promise<ComponentLogs>;
  latestVersions(bitIds: BitIds): Promise<ComponentObjects[]>;
  graph(bitId?: BitId): Promise<DependencyGraph>;
}
