import React, { HTMLAttributes } from 'react';
import { PillLabel } from '@teambit/design.ui.pill-label';
import styles from './component-count.module.scss';

export type ComponentCountProps = {
  count?: number;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCount({ className, count }: ComponentCountProps) {
  if (count === null || count === undefined) return null;
  return (
    <PillLabel className={className}>
      <span className={styles.componentCount}>{count}</span>
      <span>Components</span>
    </PillLabel>
  );
}
