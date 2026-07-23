import React from 'react';
import { ComponentsOverviewSkeleton } from '@teambit/explorer.ui.components-overview';
import styles from './workspace-skeleton.module.scss';

/**
 * Full-shell loading placeholder shown while the (light) workspace query resolves. Mirrors the real
 * workspace chrome — top bar, sidebar column, content grid — so there is no blank flash and no
 * layout shift when the live UI takes over. Previously this gap rendered an empty `<div>`, which
 * read as a frozen/blank screen on slower workspaces.
 */
export function WorkspaceSkeleton() {
  return (
    <div className={styles.wrapper} aria-busy="true" aria-live="polite">
      <div className={styles.topbar}>
        <div className={styles.corner} />
        <div className={styles.topbarNav}>
          <span className={styles.navItem} />
          <span className={styles.navItem} />
          <span className={styles.navItem} />
        </div>
      </div>
      <div className={styles.main}>
        <div className={styles.sidebar}>
          <span className={styles.sidebarSearch} />
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={styles.sidebarRow} style={{ width: `${55 + ((i * 13) % 35)}%` }} />
          ))}
        </div>
        <div className={styles.content}>
          <ComponentsOverviewSkeleton count={12} />
        </div>
      </div>
    </div>
  );
}
