import React from 'react';
import classNames from 'classnames';
import { UserAvatar, UserAvatarProps } from '@teambit/ui.avatar';
import styles from './owner-avatar.module.scss';

export type OwnerAvatarProps = {
  props: UserAvatarProps;
} & React.HTMLAttributes<HTMLElement>;

export function OwnerAvatar({ props, className }: OwnerAvatarProps) {
  return (
    <div className={classNames(styles.isOwner, className)}>
      <UserAvatar {...props} />
    </div>
  );
}
