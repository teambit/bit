import React from 'react';
import { Icon } from '@teambit/design.elements.icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { useCompareData } from '@teambit/component.ui.component-compare.component-compare';
import styles from './base-source-indicator.module.scss';

export type BaseSourceIndicatorProps = {
  /** the compare-side id of the pair, used to look up the bulk-compare load state for this base */
  compareId: string;
};

/**
 * Surfaces that a component's compared base was pulled from the remote scope (rather than already
 * being in the workspace), plus its load state. The caller renders this only for remote-sourced
 * bases; workspace-resolved bases show nothing.
 *  - spinner: the base diff is still being fetched from the remote.
 *  - error: the base diff failed to load from the remote.
 *  - cloud: the base was resolved from the remote scope and its diff is ready.
 */
export function BaseSourceIndicator({ compareId }: BaseSourceIndicatorProps) {
  const compareData = useCompareData();
  const data = compareData?.getData(compareId);
  const loading = Boolean(compareData?.loading) && data === undefined;

  if (loading) {
    return (
      <Tooltip content="Resolving base from the remote scope…" placement="top">
        <span className={styles.indicator} data-state="loading" aria-label="Resolving base from the remote scope">
          <Icon of="spinner" className={styles.spin} />
        </span>
      </Tooltip>
    );
  }

  if (data === null) {
    return (
      <Tooltip content="Base unavailable from the remote scope" placement="top">
        <span className={styles.indicator} data-state="unavailable" aria-label="Base unavailable from the remote scope">
          <Icon of="exclamation-triangle" />
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip content="Base pulled from the remote scope" placement="top">
      <span className={styles.indicator} data-state="remote" aria-label="Base pulled from the remote scope">
        <Icon of="bit-cloud" />
      </span>
    </Tooltip>
  );
}
