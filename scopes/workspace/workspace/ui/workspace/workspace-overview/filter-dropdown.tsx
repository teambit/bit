import React, { useMemo, useContext } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WorkspaceContext } from '../workspace-context';
import styles from './workspace-overview.module.scss';

export function FilterDropdown({ groupType }: { groupType: string }) {
  const workspace = useContext(WorkspaceContext);
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    if (groupType === 'namespaces') return Array.from(new Set(workspace.components.map((c) => c.id.namespace || '')));

    if (groupType === 'scopes') return Array.from(new Set(workspace.components.map((c) => c.id.scope)));

    return [];
  }, [groupType, workspace.components]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const comp of workspace.components) {
      const key = groupType === 'namespaces' ? comp.id.namespace || '' : comp.id.scope;

      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [workspace.components, groupType]);

  const selected = (searchParams.get('filter') || '').split(',').filter(Boolean);

  const toggle = (val: string) => {
    const set = new Set(selected);
    if (set.has(val)) set.delete(val);
    else set.add(val);

    if (set.size === 0) {
      searchParams.delete('filter');
    } else {
      searchParams.set('filter', Array.from(set).join(','));
    }
    setSearchParams(searchParams);
  };

  return (
    <div className={styles.filterDropdown}>
      <div className={styles.dropdownList}>
        {values.map((v) => (
          <label key={v} className={styles.dropdownItem}>
            <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} />
            <span>
              {(v === '' ? '/' : v) + ' '}
              <span className={styles.count}>({counts.get(v)})</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
