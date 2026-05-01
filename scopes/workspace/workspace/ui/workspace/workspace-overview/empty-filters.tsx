import React from 'react';
import styles from './empty-filters.module.scss';

export interface EmptyFiltersProps {
  onClear: () => void;
}

export function EmptyFilters({ onClear }: EmptyFiltersProps) {
  return (
    <div className={styles.container}>
      <div className={styles.headline}>Nothing matches.</div>
      <div className={styles.body}>Try clearing namespace, scope, or status filters.</div>
      <button className={styles.clearButton} onClick={onClear} type="button">
        Clear all filters
      </button>
    </div>
  );
}
