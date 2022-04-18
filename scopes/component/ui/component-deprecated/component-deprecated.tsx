import React from 'react';
import classNames from 'classnames';
import { PillLabel } from '@teambit/design.ui.pill-label';
import deprecatedIcon from './deprecated-icon.svg';
import styles from './component-deprecated.module.scss';

export type ComponentDeprecatedProps = {} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentDeprecated({ className }: ComponentDeprecatedProps) {
  return (
    <PillLabel className={classNames(styles.componentDeprecated, className)}>
      <img src={deprecatedIcon} />
      Deprecated
    </PillLabel>
  );
}
