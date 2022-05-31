import classNames from 'classnames';
import React, { ReactElement } from 'react';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './component-compare-status-resolver.module.scss';

export type CompareStatus = 'modified' | 'new' | 'deleted';

function ToolTip({ status, children }: { status: CompareStatus; children: ReactElement<any> | string }) {
  const content = (
    <ul className={styles.list}>
      {status === 'new' && <li>New</li>}
      {status === 'modified' && <li>Modified</li>}
      {status === 'deleted' && <li>Deleted</li>}
    </ul>
  );

  return (
    <Tooltip className={styles.tooltip} placement="right" content={content}>
      {children}
    </Tooltip>
  );
}

function Status({ status, className, ...rest }: { status: CompareStatus } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={classNames(styles.status, styles[status], className)}>
      {status[0].toUpperCase()}
    </div>
  );
}

export type CompareStatusResolverProps = {
  status: CompareStatus;
};

export function CompareStatusResolver({ status }: CompareStatusResolverProps) {
  return (
    <ToolTip status={status}>
      <div className={styles.statusLine}>
        <Status status={status} />
      </div>
    </ToolTip>
  );
}
