import classNames from 'classnames';
import React from 'react';

import styles from './pill-label.module.scss';

// TODO - export to base-ui when possible and use in versionLabel

export type PillLabelProps = {} & React.HTMLAttributes<HTMLDivElement>;

/**
 *
 * A pill shaped label with round borders
 */
export function PillLabel({ children, className }: PillLabelProps) {
  return <div className={classNames(styles.pillLabel, className)}>{children}</div>;
}
