import React, { HTMLAttributes, ReactNode } from 'react';
import classnames from 'classnames';
import styles from './compare-split-layout-preset.module.scss';

type CompareSplitLayoutPresetProps = {
  base: ReactNode;
  compare: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function CompareSplitLayoutPreset(props: CompareSplitLayoutPresetProps) {
  const { base, compare, className } = props;

  return (
    <div className={classnames([styles.mainContainer, className])}>
      <div className={styles.subContainerLeft}>{base}</div>
      <div className={styles.subContainerRight}>{compare}</div>
    </div>
  );
}
