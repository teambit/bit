import type { ReactNode } from 'react';
import React from 'react';
import classnames from 'classnames';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import overviewStyles from './components-overview.module.scss';
import styles from './components-overview-skeleton.module.scss';

export type ComponentsOverviewSkeletonProps = {
  /** number of placeholder cards to render. default: 12 */
  count?: number;
  /** replace the default filter-bar placeholder with custom header content */
  header?: ReactNode;
  className?: string;
};

/**
 * Loading placeholder for the components grid. Renders through the SAME `ComponentGrid` + `.cardGrid`
 * class the real `ComponentsOverview` uses, so the column count / card size is pixel-identical and the
 * grid doesn't reflow when live data lands. The card body mirrors `HopeComponentCard` (180px preview
 * block + footer row with scope badge, name, hash). Shown while the light workspace query is in
 * flight; reusable by any view that renders `ComponentsOverview` (workspace overview, lane overview).
 */
export function ComponentsOverviewSkeleton({ count = 12, header, className }: ComponentsOverviewSkeletonProps) {
  return (
    <div className={classnames(overviewStyles.container, className)} aria-busy="true" aria-live="polite">
      <div className={overviewStyles.stickyHeader}>
        {header || (
          <div className={overviewStyles.commandBar}>
            <div className={overviewStyles.leftCluster}>
              <span className={styles.pill} />
              <span className={styles.pill} />
            </div>
            <span className={styles.toggle} />
          </div>
        )}
      </div>
      <div className={overviewStyles.content}>
        <ComponentGrid className={overviewStyles.cardGrid}>
          {Array.from({ length: count }).map((_, index) => (
            <div
              key={index}
              className={styles.card}
              // staggered fade so the grid reads as "loading", not frozen
              style={{ animationDelay: `${(index % 4) * 70}ms` }}
            >
              <div className={styles.preview}>
                <div className={styles.shimmer} />
              </div>
              <div className={styles.footer}>
                <span className={styles.scopeBadge} />
                <span className={styles.name} />
                <span className={styles.hash} />
              </div>
            </div>
          ))}
        </ComponentGrid>
      </div>
    </div>
  );
}
