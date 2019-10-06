import { BitIds, BitId } from '../../bit-id';
import ComponentObjects from '../../scope/component-objects';
import { ScopeDescriptor } from '../scope';
import Component from '../../consumer/component';
import { ListScopeResult } from '../../consumer/component/components-list';
import DependencyGraph from '../graph/scope-graph';
import { SSHConnectionStrategyName } from './ssh/ssh';

export interface Network {
  connect(host: string): Network;
  close(): void;
  describeScope(): Promise<ScopeDescriptor>;
  fetch(bitIds: BitIds): Promise<ComponentObjects[]>;
  list(namespacesUsingWildcards?: string, strategiesNames?: SSHConnectionStrategyName[]): Promise<ListScopeResult[]>;
  search(query: string, reindex: boolean): Promise<string>;
  show(bitId: BitId): Promise<Component | null | undefined>;
  deprecateMany(ids: string[], context: Object | null | undefined): Promise<Object[]>;
  undeprecateMany(ids: string[], context: Object | null | undefined): Promise<Object[]>;
  latestVersions(bitIds: BitIds): Promise<ComponentObjects[]>;
  graph(bitId?: BitId): Promise<DependencyGraph>;
}
