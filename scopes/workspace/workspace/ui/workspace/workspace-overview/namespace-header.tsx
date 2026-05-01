import React from 'react';
import { getAccent, getTint } from './namespace-hues';
import { getComponentStatus } from './filter-utils';
import type { WorkspaceItem } from './workspace-overview.types';
import styles from './namespace-header.module.scss';

export interface NamespaceHeaderProps {
  namespace: string;
  items: WorkspaceItem[];
}

export function NamespaceHeader({ namespace, items }: NamespaceHeaderProps) {
  const accent = getAccent(namespace);
  const tint = getTint(namespace);

  let buildingCount = 0;
  let readyCount = 0;
  for (const item of items) {
    const s = getComponentStatus(item);
    if (s === 'building') buildingCount++;
    if (s === 'built' || s === 'changed') readyCount++;
  }

  return (
    <header className={styles.header}>
      <span className={styles.dot} style={{ background: accent }} />
      <span className={styles.name}>{namespace}</span>
      <span className={styles.count}>
        {readyCount}/{items.length}
      </span>
      {buildingCount > 0 && (
        <span className={styles.buildingPill} style={{ color: accent, background: tint }}>
          <span className={styles.buildingDot} style={{ background: accent }} />
          building
        </span>
      )}
      <div className={styles.divider} />
    </header>
  );
}
