import React from 'react';
import classNames from 'classnames';
import type { DeprecationInfo } from '@teambit/deprecation';
import { PillLabel } from '@teambit/design.ui.pill-label';
import styles from './component-deprecated.module.scss';

export type ComponentDeprecatedProps = {
  deprecation?: DeprecationInfo;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentDeprecated({ deprecation, className }: ComponentDeprecatedProps) {
  const isDeprecated = deprecation?.isDeprecate;
  if (!isDeprecated) return null;

  return (
    <PillLabel className={classNames(styles.label, className)}>
      <img src="https://static.bit.dev/bit-icons/deprecated-black.svg" />
      Deprecated
    </PillLabel>
  );
}
