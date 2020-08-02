import React from 'react';
import { NavLink } from 'react-router-dom';
import styles from './corner.module.scss';

export type CornerProps = {
  /**
   * name of the workspace or scope.
   */
  name: string;
};

export function Corner({ name }: CornerProps) {
  return (
    <NavLink to="/" className={styles.corner}>
      <span className={styles.avatar}>A</span> {name}
    </NavLink>
  );
}
