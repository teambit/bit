import React from 'react';
import classNames from 'classnames';
import { ComponentsOverviewSkeleton } from '@teambit/explorer.ui.components-overview';
import styles from './workspace-skeleton.module.scss';

export type WorkspaceSkeletonProps = {
  /**
   * minimal (Hope) mode layout - no sidebar and no workspace corner.
   */
  isMinimal?: boolean;
  /**
   * whether the real UI renders a top bar for the current route.
   */
  showTopBar?: boolean;
};

/**
 * Full-shell loading placeholder shown while the (light) workspace query resolves. Mirrors the real
 * workspace chrome — top bar, sidebar column, content grid — so there is no blank flash and no
 * layout shift when the live UI takes over. Previously this gap rendered an empty `<div>`, which
 * read as a frozen/blank screen on slower workspaces.
 *
 * In minimal (Hope) mode the sidebar starts closed and there is no workspace corner, so the skeleton
 * drops both, and skips the top bar entirely where the real UI hides it (the workspace overview).
 */
export function WorkspaceSkeleton({ isMinimal = false, showTopBar = true }: WorkspaceSkeletonProps) {
  return (
    <div className={styles.wrapper} aria-busy="true" aria-live="polite">
      {showTopBar && (
        <div className={classNames(styles.topbar, isMinimal && styles.minimalTopbar)}>
          {!isMinimal && <div className={styles.corner} />}
          <div className={styles.topbarNav}>
            <span className={styles.navItem} />
            <span className={styles.navItem} />
            <span className={styles.navItem} />
          </div>
        </div>
      )}
      <div className={styles.main}>
        {!isMinimal && (
          <div className={styles.sidebar}>
            <span className={styles.sidebarSearch} />
            {Array.from({ length: 10 }).map((_, i) => (
              <span key={i} className={styles.sidebarRow} style={{ width: `${55 + ((i * 13) % 35)}%` }} />
            ))}
          </div>
        )}
        <div className={styles.content}>
          <ComponentsOverviewSkeleton count={12} />
        </div>
      </div>
    </div>
  );
}
