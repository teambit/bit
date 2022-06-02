import React, { ReactNode } from 'react';
import styles from './compare-split-layout-preset.module.scss';

type CompareSplitLayoutPresetProps = {
  base: ReactNode;
  compare: ReactNode;
};

export function CompareSplitLayoutPreset(props: CompareSplitLayoutPresetProps) {
  const { base, compare } = props;

  return (
    <div className={styles.mainContainer}>
      <div className={styles.subContainerLeft}>{base}</div>
      <div className={styles.subContainerRight}>{compare}</div>
    </div>
  );
}
