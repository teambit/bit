import React from 'react';
import classNames from 'classnames';

import styles from './loader-ribbon.module.scss';

export function LoaderRibbon({ active }: { active: boolean }) {
  return (
    <div className={classNames(styles.loader, active && styles.loading)}>
      <div className={styles.progress} />
    </div>
  );
}
