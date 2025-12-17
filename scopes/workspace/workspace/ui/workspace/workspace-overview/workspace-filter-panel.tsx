import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ToggleButton } from '@teambit/design.inputs.toggle-button';
import { BaseFilter } from '@teambit/component.filters.base-filter';
import type { WorkspaceItem, AggregationType } from './workspace-overview.types';
import styles from './workspace-overview.module.scss';

export interface WorkspaceFilterPanelProps {
  aggregation: AggregationType;
  availableAggregations: AggregationType[];
  items: WorkspaceItem[];
}

const LABELS: Record<AggregationType, string> = {
  namespaces: 'Namespaces',
  scopes: 'Scopes',
  none: 'None',
};

export function WorkspaceFilterPanel({ aggregation, availableAggregations, items }: WorkspaceFilterPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();

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

  const activeNamespaces = (searchParams.get('ns') || '')
    .split(',')
    .filter(Boolean)
    .map((v) => ({ value: v }));

  const activeScopes = (searchParams.get('scopes') || '')
    .split(',')
    .filter(Boolean)
    .map((v) => ({ value: v }));

  const applyNs = (opts) => {
    const list = opts.map((o) => o.value).filter((v): v is string => typeof v === 'string');

    if (list.length) searchParams.set('ns', list.join(','));
    else searchParams.delete('ns');

    setSearchParams(searchParams);
  };

  const applyScopes = (opts) => {
    const list = opts.map((o) => o.value).filter((v): v is string => typeof v === 'string');

    if (list.length) searchParams.set('scopes', list.join(','));
    else searchParams.delete('scopes');

    setSearchParams(searchParams);
  };

  const currentIndex = Math.max(
    0,
    availableAggregations.findIndex((a) => a === aggregation)
  );

  const applyAgg = (i: number) => {
    const agg = availableAggregations[i];
    searchParams.set('aggregation', agg);
    setSearchParams(searchParams);
  };

  return (
    <div className={styles.filterPanel}>
      <div className={styles.leftFilters}>
        <BaseFilter
          id="namespaces"
          placeholder="Namespaces"
          options={namespaceOptions}
          activeOptions={activeNamespaces}
          onChange={applyNs}
          isSearchable
        />

        <BaseFilter
          id="scopes"
          placeholder="Scopes"
          options={scopeOptions}
          activeOptions={activeScopes}
          onChange={applyScopes}
          isSearchable
        />
      </div>

      <div className={styles.rightAggToggle}>
        <ToggleButton
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
