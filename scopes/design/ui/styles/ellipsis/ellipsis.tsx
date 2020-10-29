import React, { HTMLAttributes } from 'react';
import classnames from 'classnames';

import styles from './ellipsis.module.scss';

export function Ellipsis(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classnames(props.className, styles.ellipsisDiv)} />;
}
