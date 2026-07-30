import React from 'react';
import type { ReactNode } from 'react';
import styles from './preview-compare.module.scss';

// --- Types ---

export type PreviewCompareRendererProps = {
  /** Whether the preview content has loaded */
  loaded: boolean;
  /** The actual preview content (iframes, composition compare, etc.) */
  children?: ReactNode;
};

/**
 * Pure preview compare renderer. No hooks, no data fetching.
 * Shows a browser skeleton placeholder until loaded, then reveals children.
 */
export function PreviewCompareRenderer({ loaded, children }: PreviewCompareRendererProps) {
  return (
    <div className={styles.previewCompare}>
      {!loaded && <BrowserSkeletonSplit />}
      <div style={loaded ? undefined : { height: 0, overflow: 'hidden' }}>{children}</div>
    </div>
  );
}

// --- Browser Skeleton (split base/compare) ---

export function BrowserSkeletonSplit() {
  return (
    <div className={styles.browserSkeletonSplit}>
      <BrowserSkeleton />
      <BrowserSkeleton />
    </div>
  );
}

export function BrowserSkeleton() {
  return (
    <div className={styles.browserSkeleton}>
      <div className={styles.browserToolbar}>
        <span className={styles.browserDot} />
        <span className={styles.browserDot} />
        <span className={styles.browserDot} />
        <div className={styles.browserUrlBar} />
      </div>
      <div className={styles.browserBody}>
        <div className={styles.browserLine1} />
        <div className={styles.browserLine2} />
        <div className={styles.browserLine3} />
        <div className={styles.browserLine4} />
      </div>
    </div>
  );
}
