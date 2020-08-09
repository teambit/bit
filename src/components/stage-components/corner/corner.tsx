import React from 'react';
import { NavLink } from 'react-router-dom';
import { Icon } from '@teambit/evangelist-temp.elements.icon';
import styles from './corner.module.scss';

export type CornerProps = {
  /**
   * name of the workspace or scope.
   */
  name: string;
  /**
   * controls opening and closing of the sidebar
   */
  onClick: () => void;
};

export function Corner({ name, onClick }: CornerProps) {
  return (
    <div className={styles.corner}>
      <NavLink to="/" className={styles.link}>
        <span className={styles.avatar}>A</span> {name}
      </NavLink>
      <Icon of="vertical-left" onClick={onClick} className={styles.icon} />
    </div>
  );
}
