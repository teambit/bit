import { UserAvatar } from '@teambit/design.ui.avatar';
import React from 'react';
import classNames from 'classnames';
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
} & React.HTMLAttributes<HTMLDivElement>;

export function Corner({ name, icon, className, ...rest }: CornerProps) {
  return (
    <div {...rest} className={classNames(styles.corner, className)}>
      <NavLink to="/" className={styles.link}>
        {icon ? (
          <img src={icon} width={25} height={25} />
        ) : (
          <UserAvatar size={25} account={{ name, profileImage: icon }} className={styles.avatar} />
        )}
        <span>{name}</span>
      </NavLink>
    </div>
  );
}
