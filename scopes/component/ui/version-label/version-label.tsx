import { PillLabel } from '@teambit/design.ui.pill-label';
import classNames from 'classnames';
import React from 'react';

import styles from './version-label.module.scss';

type VersionLabelProps = {
  status: 'latest' | 'checked-out' | 'current';
} & React.HTMLAttributes<HTMLDivElement>;

export function VersionLabel({ status, className, ...rest }: VersionLabelProps) {
  return (
    <PillLabel {...rest} className={classNames(styles.label, styles[status], className)}>
      {status.replace(/-/g, ' ')}
    </PillLabel>
  );
}

export type LabelsProps = {
  isCurrent?: boolean;
  isLatest?: boolean;
};

export function Labels({ isCurrent, isLatest }: LabelsProps) {
  return (
    <div className={styles.labelContainer}>
      {isLatest && <VersionLabel className={styles.versionLabel} status="latest" />}
      {/* {isCurrent && <VersionLabel status="checked-out" />} */}
      {isCurrent && <VersionLabel className={styles.versionLabel} status="current" />}
      {!isLatest && !isCurrent && <div className={styles.emptyLabel} />}
    </div>
  );
}
