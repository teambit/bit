import React from 'react';
import styles from './card-overlays.module.scss';

export function ChangedPill() {
  return (
    <span className={styles.changedPill}>
      <span className={styles.changedDot} />
      changed
    </span>
  );
}

export function BuildSpinner({ accent }: { accent: string }) {
  return (
    <div className={styles.spinnerBadge}>
      <svg width="14" height="14" viewBox="0 0 14 14">
        <circle cx="7" cy="7" r="5" stroke={`${accent}33`} strokeWidth="1.5" fill="none" />
        <circle
          cx="7"
          cy="7"
          r="5"
          stroke={accent}
          strokeWidth="1.5"
          fill="none"
          strokeDasharray="8 24"
          strokeLinecap="round"
          className={styles.spinnerArc}
        />
      </svg>
    </div>
  );
}

export function BuildingPreview({ accent }: { accent: string }) {
  const patternId = `dots-${accent.replace(/[^a-z0-9]/g, '')}`;
  return (
    <div className={styles.buildingPreview}>
      <svg width="100%" height="100%" preserveAspectRatio="none" className={styles.dotsPattern}>
        <defs>
          <pattern id={patternId} width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="7" cy="7" r="1" fill={`${accent}33`} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
      <div className={styles.buildingPlaceholder} style={{ border: `1.5px dashed ${accent}66` }}>
        <div style={{ height: 6, width: '55%', background: `${accent}44`, borderRadius: 3 }} />
        <div style={{ height: 4, width: '85%', background: `${accent}22`, borderRadius: 2 }} />
        <div style={{ height: 4, width: '70%', background: `${accent}22`, borderRadius: 2 }} />
      </div>
    </div>
  );
}

export function QueuedPreview({ accent }: { accent: string }) {
  return (
    <div className={styles.queuedPreview}>
      <svg width="46" height="46" viewBox="0 0 46 46">
        <circle cx="23" cy="23" r="20" fill="none" stroke={`${accent}33`} strokeWidth="1.2" strokeDasharray="3 4" />
        <circle cx="23" cy="23" r="3" fill={`${accent}88`} />
      </svg>
    </div>
  );
}
