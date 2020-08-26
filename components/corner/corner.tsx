import { UserAvatar } from '@teambit/staged-components.workspace-components.avatar';
import React from 'react';
import { NavLink } from 'react-router-dom';

import styles from './corner.module.scss';

export type CornerProps = {
  /**
   * name of the workspace or scope.
   */
  name: string;
  /**
   * icon of the owner.
   */
  icon?: string;
};

export function Corner({ name, icon }: CornerProps) {
  return (
    <div className={styles.corner}>
      <NavLink to="/" className={styles.link}>
        <UserAvatar size={25} account={{ name, profileImage: icon }} className={styles.avatar} />
        <span>{name}</span>
      </NavLink>
    </div>
  );
}
