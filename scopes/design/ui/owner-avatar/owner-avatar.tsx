import React from 'react';
import classNames from 'classnames';
import { UserAvatar, UserAvatarProps } from '@teambit/design.ui.avatar';
import styles from './owner-avatar.module.scss';

export type OwnerAvatarProps = {
  ownerClassName?: string;
} & UserAvatarProps;

export function OwnerAvatar({ ownerClassName, size, ...rest }: OwnerAvatarProps) {
  return (
    <div style={{ width: `${size}px`, height: `${size}px` }} className={classNames(styles.isOwner, ownerClassName)}>
      <UserAvatar size={size} {...rest} />
    </div>
  );
}
