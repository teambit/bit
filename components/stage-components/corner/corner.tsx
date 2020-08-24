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
    <div className={styles.corner}>
      <NavLink to="/" className={styles.link}>
        {name}
      </NavLink>
    </div>
  );
}
