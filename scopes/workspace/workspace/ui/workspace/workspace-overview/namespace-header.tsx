import React from 'react';
import { getComponentStatus } from './filter-utils';
import type { WorkspaceItem } from './workspace-overview.types';
import styles from './namespace-header.module.scss';

export interface NamespaceHeaderProps {
  namespace: string;
  items: WorkspaceItem[];
  scopeIcon?: string;
  scopeIconColor?: string;
}

export function NamespaceHeader({ namespace, items, scopeIcon, scopeIconColor }: NamespaceHeaderProps) {
  const accent = 'var(--bit-accent-color, #6c5ce7)';
  const tint = 'color-mix(in srgb, var(--bit-accent-color, #6c5ce7) 12%, transparent)';

  let buildingCount = 0;
  let readyCount = 0;
  for (const item of items) {
    const s = getComponentStatus(item);
    if (s === 'building') buildingCount++;
    if (s === 'built' || s === 'changed') readyCount++;
  }

  return (
    <header className={styles.header}>
      <HeaderIcon scopeIcon={scopeIcon} scopeIconColor={scopeIconColor} namespace={namespace} accent={accent} />
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

function HeaderIcon({
  scopeIcon,
  scopeIconColor,
  namespace,
  accent,
}: {
  scopeIcon?: string;
  scopeIconColor?: string;
  namespace: string;
  accent: string;
}) {
  if (scopeIcon) {
    return (
      <div className={styles.scopeIconBadge} style={{ background: scopeIconColor || accent }}>
        <img src={scopeIcon} className={styles.scopeIconImg} alt="" />
      </div>
    );
  }

  if (scopeIconColor) {
    const initial = namespace.split(/[./]/).pop()?.charAt(0).toUpperCase() || '?';
    return (
      <div className={styles.scopeIconBadge} style={{ background: scopeIconColor }}>
        <span className={styles.scopeInitial}>{initial}</span>
      </div>
    );
  }

  return <span className={styles.dot} style={{ background: accent }} />;
}
