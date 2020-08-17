import React from 'react';
import classNames from 'classnames';
import styles from './version-label.module.scss';
import { PillLabel } from '../../pill-label';

type VersionLabelProps = {
  status: 'latest' | 'checked-out';
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
    <div>
      {isLatest && <VersionLabel className={styles.versionLabel} status="latest" />}
      {isCurrent && <VersionLabel status="checked-out" />}
      {!isLatest && !isCurrent && <div className={styles.emptyLabel} />}
    </div>
  );
}
