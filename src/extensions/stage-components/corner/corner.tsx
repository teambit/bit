import React from 'react';
import styles from './corner.module.scss';

export type CornerProps = {
  /**
   * name of the workspace or scope.
   */
  name: string;
};

export function Corner({ name }: CornerProps) {
  return (
    <div className={styles.corner}>
      <span className={styles.avatar}>A</span> {name}
    </div>
  );
}
