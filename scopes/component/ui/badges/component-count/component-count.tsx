import React, { HTMLAttributes } from 'react';
import { PillLabel } from '@teambit/design.ui.pill-label';
import styles from './component-count.module.scss';

export type ComponentCountProps = {
  count?: number;
} & HTMLAttributes<HTMLDivElement>;

export function ComponentCount({ className, count: componentCount }: ComponentCountProps) {
  if (!componentCount) return null;
  return (
    <PillLabel className={className}>
      <span className={styles.componentCount}>{componentCount}</span>
      <span>Components</span>
    </PillLabel>
  );
}
