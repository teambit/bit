import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import type { ScopeID } from '@teambit/scopes.scope-id';

export interface WorkspaceItem {
  component: ComponentModel;
  componentDescriptor: ComponentDescriptor;
  scope?: { id: ScopeID; icon?: string; backgroundIconColor?: string };
}

export type AggregationType = 'namespaces' | 'scopes' | 'none';

export type Density = 'compact' | 'comfy';

export type ComponentStatus = 'built' | 'changed' | 'building' | 'queued';

export interface AggregationGroup {
  name: string;
  displayName: string;
  items: WorkspaceItem[];
  scopeIcon?: string;
  scopeIconColor?: string;
}

export interface AggregationResult {
  groups: AggregationGroup[];
  groupType: AggregationType;
  availableAggregations: AggregationType[];
  filteredCount: number;
}
