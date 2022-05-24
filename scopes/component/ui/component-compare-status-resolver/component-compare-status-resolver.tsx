import classNames from 'classnames';
import React, {ReactElement} from 'react';
import styles from './component-compare-status-resolver.module.scss';
import {Tooltip} from '@teambit/design.ui.tooltip';

export type CompareStatus = 'modified' | 'added' | 'removed';

function ToolTip({ status, children }: { status: CompareStatus; children: ReactElement<any> | string }) {
  const content = (
    <ul className={styles.list}>
      {status === 'added' && <li>New component</li>}
      {status === 'modified' && <li>Modified component</li>}
      {status === 'removed' && <li>Deleted component</li>}
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

export type ComponentCompareStatusResolverProps = {
  status: CompareStatus;
};

export function ComponentCompareStatusResolver({ status }: ComponentCompareStatusResolverProps) {
  return (
    <ToolTip status={status}>
      <div className={styles.statusLine}>
        {status === 'added' && <Status status="added" />}
        {status === 'removed' && <Status status="removed" />}
        {status === 'modified' && <Status status="modified" />}
      </div>
    </ToolTip>
  );
}
