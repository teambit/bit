import React from 'react';
import classNames from 'classnames';
import type { ComponentStatus } from './workspace-overview.types';
import styles from './status-pills.module.scss';

const STATUS_META: Record<ComponentStatus, { label: string; dotColor: string }> = {
  built: { label: 'Built', dotColor: 'var(--positive-color)' },
  changed: { label: 'Changed', dotColor: 'var(--warning-color)' },
  building: { label: 'Building', dotColor: 'var(--primary-color)' },
  queued: { label: 'Queued', dotColor: 'var(--on-background-low-color)' },
};

export interface StatusPillsProps {
  statuses: Set<ComponentStatus>;
  onToggle: (status: ComponentStatus) => void;
  counts: Record<ComponentStatus, number>;
  visibleStatuses?: ComponentStatus[];
}

export function StatusPills({
  statuses,
  onToggle,
  counts,
  visibleStatuses = ['building', 'changed', 'queued'],
}: StatusPillsProps) {
  return (
    <>
      {visibleStatuses.map((s) => {
        const active = statuses.has(s);
        const meta = STATUS_META[s];
        const isBuilding = s === 'building' && active;

        return (
          <button
            key={s}
            className={classNames(styles.pill, active && styles.active)}
            onClick={() => onToggle(s)}
            type="button"
          >
            <span
              className={classNames(
                active ? styles.dotActive : styles.dot,
                isBuilding && styles.dotBuilding,
                isBuilding && styles.pulsingRing
              )}
              style={active ? { background: meta.dotColor } : undefined}
            />
            {meta.label}
            <span className={styles.count}>{counts[s]}</span>
          </button>
        );
      })}
    </>
  );
}
