import React from 'react';
import classNames from 'classnames';
import { RoundLoader } from '@teambit/design.ui.round-loader';
import styles from './test-loader.module.scss';

export type TestLoaderProps = {} & React.HTMLAttributes<HTMLDivElement>;

/**
 * a loader component that shows when waiting for tests to show
 */
export function TestLoader({ className, ...rest }: TestLoaderProps) {
  return (
    <div {...rest} className={classNames(styles.testLoader, className)}>
      <RoundLoader />
      <img src="http://static.bit.dev/harmony/test-loader.svg" />
      <div className={styles.text}>Running tests. please wait</div>
      <div>This might take up to a minute</div>
    </div>
  );
}
