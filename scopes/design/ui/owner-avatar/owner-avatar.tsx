import React from 'react';
import classNames from 'classnames';
import { UserAvatar, UserAvatarProps } from '@teambit/ui.avatar';
import styles from './owner-avatar.module.scss';

export type OwnerAvatarProps = {
  avatarProps: UserAvatarProps;
} & React.HTMLAttributes<HTMLElement>;

export function OwnerAvatar({ avatarProps, className }: OwnerAvatarProps) {
  return (
    <div className={classNames(styles.isOwner, className)}>
      <UserAvatar {...avatarProps} />
    </div>
  );
}
