import React from 'react';
import type { Density } from './workspace-overview.types';
import styles from './density-toggle.module.scss';

export interface DensityToggleProps {
  value: Density;
  onChange: (density: Density) => void;
}

const CompactIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14">
    <rect x="0" y="0" width="6" height="6" rx="1.2" fill="currentColor" />
    <rect x="8" y="0" width="6" height="6" rx="1.2" fill="currentColor" />
    <rect x="0" y="8" width="6" height="6" rx="1.2" fill="currentColor" />
    <rect x="8" y="8" width="6" height="6" rx="1.2" fill="currentColor" />
  </svg>
);

const ComfyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14">
    <rect x="0" y="0" width="14" height="6" rx="1.2" fill="currentColor" />
    <rect x="0" y="8" width="14" height="6" rx="1.2" fill="currentColor" />
  </svg>
);

const OPTIONS: { value: Density; icon: React.ReactNode }[] = [
  { value: 'compact', icon: <CompactIcon /> },
  { value: 'comfy', icon: <ComfyIcon /> },
];

export function DensityToggle({ value, onChange }: DensityToggleProps) {
  return (
    <div className={styles.track}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={value === o.value ? styles.optionActive : styles.option}
          onClick={() => onChange(o.value)}
          type="button"
          aria-label={`${o.value} density`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
