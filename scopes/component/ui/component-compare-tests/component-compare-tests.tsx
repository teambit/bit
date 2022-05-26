import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';

import styles from './component-compare-tests.module.scss';

export type ComponentCompareTestsProps = {} & HTMLAttributes<HTMLDivElement>;

export function ComponentCompareTests({ className }: ComponentCompareTestsProps) {
  return <div className={classNames(styles.page, className)}>Hello Tests</div>;
}
