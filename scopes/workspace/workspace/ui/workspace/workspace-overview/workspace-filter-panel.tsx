import React, { useMemo } from 'react';
import { ToggleButton } from '@teambit/design.inputs.toggle-button';
import { BaseFilter } from '@teambit/component.filters.base-filter';
import { StatusPills } from './status-pills';
import { DensityToggle } from './density-toggle';
import type { WorkspaceItem, AggregationType, Density, ComponentStatus } from './workspace-overview.types';
import { getComponentStatus } from './filter-utils';
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
  statuses: Set<ComponentStatus>;
  onToggleStatus: (status: ComponentStatus) => void;
  density: Density;
  onDensityChange: (density: Density) => void;
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
  statuses,
  onToggleStatus,
  density,
  onDensityChange,
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

  const counts = useMemo(() => {
    const c: Record<ComponentStatus, number> = { built: 0, changed: 0, building: 0, queued: 0 };
    for (const item of items) {
      const s = getComponentStatus(item);
      c[s]++;
    }
    return c;
  }, [items]);

  const activeNsOptions = activeNamespaces.map((v) => ({ value: v }));
  const activeScopeOptions = activeScopes.map((v) => ({ value: v }));

  const applyNs = (opts: { value?: string }[]) => {
    const list = opts.map((o) => o.value).filter((v): v is string => typeof v === 'string');
    onNamespacesChange(list);
  };

  const applyScopes = (opts: { value?: string }[]) => {
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
    <div className={styles.commandBar}>
      <div className={styles.leftCluster}>
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
        <span className={styles.verticalDivider} />
        <StatusPills statuses={statuses} onToggle={onToggleStatus} counts={counts} />
      </div>

      <div className={styles.rightCluster}>
        <DensityToggle value={density} onChange={onDensityChange} />
        <ToggleButton
          className={styles.aggToggle}
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
