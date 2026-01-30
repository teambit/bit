import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import type { ScopeID } from '@teambit/scopes.scope-id';

export interface WorkspaceItem {
  component: ComponentModel;
  componentDescriptor: ComponentDescriptor;
  scope?: { id: ScopeID };
}

export type AggregationType = 'namespaces' | 'scopes' | 'none';

export interface AggregationGroup {
  name: string;
  displayName: string;
  items: WorkspaceItem[];
}

export interface AggregationResult {
  groups: AggregationGroup[];
  groupType: AggregationType;
  availableAggregations: AggregationType[];
  filteredCount: number;
}
