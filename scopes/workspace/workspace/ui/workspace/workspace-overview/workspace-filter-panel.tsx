import React, { useMemo } from 'react';
import { ToggleButton } from '@teambit/design.inputs.toggle-button';
import { BaseFilter } from '@teambit/component.filters.base-filter';
import type { WorkspaceItem, AggregationType } from './workspace-overview.types';
import styles from './workspace-overview.module.scss';

export interface WorkspaceFilterPanelProps {
  aggregation: AggregationType;
  onAggregationChange: (agg: AggregationType) => void;
  availableAggregations: AggregationType[];
  items: WorkspaceItem[];
  activeNamespaces: string[];
  onNamespacesChange: (namespaces: string[]) => void;
  activeScopes: string[];
  onScopesChange: (scopes: string[]) => void;
}

const LABELS: Record<AggregationType, string> = {
  namespaces: 'Namespaces',
  scopes: 'Scopes',
  none: 'None',
};

export function WorkspaceFilterPanel({
  aggregation,
  onAggregationChange,
  availableAggregations,
  items,
  activeNamespaces,
  onNamespacesChange,
  activeScopes,
  onScopesChange,
}: WorkspaceFilterPanelProps) {
  const namespaceOptions = useMemo(
    () =>
      [...new Set(items.map((i) => i.component.id.namespace || '/'))].map((v) => ({
        value: v,
      })),
    [items]
  );

  const scopeOptions = useMemo(
    () =>
      [...new Set(items.map((i) => i.component.id.scope))].map((v) => ({
        value: v,
      })),
    [items]
  );

  const activeNsOptions = activeNamespaces.map((v) => ({ value: v }));
  const activeScopeOptions = activeScopes.map((v) => ({ value: v }));

  const applyNs = (opts) => {
    const list = opts.map((o) => o.value).filter((v): v is string => typeof v === 'string');
    onNamespacesChange(list);
  };

  const applyScopes = (opts) => {
    const list = opts.map((o) => o.value).filter((v): v is string => typeof v === 'string');
    onScopesChange(list);
  };

  const currentIndex = Math.max(
    0,
    availableAggregations.findIndex((a) => a === aggregation)
  );

  const applyAgg = (i: number) => {
    const agg = availableAggregations[i];
    onAggregationChange(agg);
  };

  return (
    <div className={styles.filterPanel}>
      <div className={styles.leftFilters}>
        <BaseFilter
          id="namespaces"
          placeholder="Namespaces"
          options={namespaceOptions}
          activeOptions={activeNsOptions}
          onChange={applyNs}
          isSearchable
        />

        <BaseFilter
          id="scopes"
          placeholder="Scopes"
          options={scopeOptions}
          activeOptions={activeScopeOptions}
          onChange={applyScopes}
          isSearchable
        />
      </div>

      <div className={styles.rightAggToggle}>
        <ToggleButton
          className={styles.toggleBtn}
          defaultIndex={currentIndex}
          onOptionSelect={(idx) => applyAgg(idx)}
          options={availableAggregations.map((agg) => ({
            value: agg,
            element: LABELS[agg],
          }))}
        />
      </div>
    </div>
  );
}
