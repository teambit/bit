import classNames from 'classnames';
import React from 'react';

import styles from './loader-ribbon.module.scss';

export function LoaderRibbon({ active }: { active: boolean }) {
  return (
    <div className={classNames(styles.loader, active && styles.loading)}>
      <div className={styles.progress} />
    </div>
  );
}
