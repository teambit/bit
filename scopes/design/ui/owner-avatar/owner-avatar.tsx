import React from 'react';
import classNames from 'classnames';
import { UserAvatar, UserAvatarProps } from '@teambit/design.ui.avatar';
import styles from './owner-avatar.module.scss';

export type OwnerAvatarProps = {
  ownerClassName?: string;
} & UserAvatarProps;

export function OwnerAvatar({ ownerClassName, ...rest }: OwnerAvatarProps) {
  return (
    <div className={classNames(styles.isOwner, ownerClassName)}>
      <UserAvatar {...rest} />
    </div>
  );
}
