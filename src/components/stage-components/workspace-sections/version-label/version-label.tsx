import React from 'react';
import classNames from 'classnames';
import styles from './version-label.module.scss';

export function VersionLabel({ status }: { status: 'latest' | 'checked-out' }) {
  return <div className={classNames(styles.label, styles[status])}>{status.replace(/-/g, ' ')}</div>;
}

export type LabelsProps = {
  isCurrent?: boolean;
  isLatest?: boolean;
};

export function Labels({ isCurrent, isLatest }: LabelsProps) {
  return (
    <div>
      {isLatest && <VersionLabel status="latest" />}
      {isCurrent && <VersionLabel status="checked-out" />}
      {!isLatest && !isCurrent && <div className={styles.emptyLabel} />}
    </div>
  );
}
