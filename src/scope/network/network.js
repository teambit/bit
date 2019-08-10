/** @flow */
import { BitIds, BitId } from '../../bit-id';
import ComponentObjects from '../../scope/component-objects';
import type { ScopeDescriptor } from '../scope';
import Component from '../../consumer/component';
import type { ListScopeResult } from '../../consumer/component/components-list';
import DependencyGraph from '../graph/scope-graph';

export interface Network {
  connect(host: string): Network;
  close(): void;
  describeScope(): Promise<ScopeDescriptor>;
  fetch(bitIds: BitIds): Promise<ComponentObjects[]>;
  list(namespacesUsingWildcards?: string): Promise<ListScopeResult[]>;
  search(query: string, reindex: boolean): Promise<string>;
  show(bitId: BitId): Promise<?Component>;
  deprecateMany(ids: string[], context: ?Object): Promise<Object[]>;
  undeprecateMany(ids: string[], context: ?Object): Promise<Object[]>;
  latestVersions(bitIds: BitIds): Promise<ComponentObjects[]>;
  graph(bitId?: BitId): Promise<DependencyGraph>;
}
