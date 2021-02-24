import React from 'react';
import classNames from 'classnames';
import { UserAvatar, UserAvatarProps } from '@teambit/ui.avatar';
import styles from './owner-avatar.module.scss';

export function OwnerAvatar(props: UserAvatarProps) {
  const { className } = props;
  return (
    <div className={classNames(styles.isOwner, className)}>
      <UserAvatar {...props} />
    </div>
  );
}
