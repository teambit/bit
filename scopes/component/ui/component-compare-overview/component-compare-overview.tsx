import React from 'react';
import styles from './component-compare-overview.module.scss';
import {useComponentCompareContext} from '@teambit/component.ui.component-compare';

export type ComponentCompareOverviewProps = {};

export function ComponentCompareOverview(props: ComponentCompareOverviewProps) {
  const componentCompare = useComponentCompareContext();

  return (
    <div className={styles.mainContainer}>
      <div className={styles.subContainerLeft}>
        <div className={styles.subView}></div>
      </div>
      <div className={styles.subContainerRight}>
        <div className={styles.subView}></div>
      </div>
    </div>
  );
}
