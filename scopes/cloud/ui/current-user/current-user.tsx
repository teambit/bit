import React from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';
import classNames from 'classnames';
import { CloudUser } from '@teambit/cloud.models.cloud-user';
import styles from './current-user.module.scss';

export type CurrentUserProps = {
  currentUser: CloudUser;
  onClick?: () => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function CurrentUser({ currentUser, onClick, className, ...rest }: CurrentUserProps) {
  return (
    <div onClick={onClick} className={classNames(styles.user, className)} {...rest}>
      <UserAvatar account={currentUser} size={24} />
      <div className={styles.userDetails}>
        <div className={styles.displayName}>{currentUser.displayName || currentUser.username}</div>
        <div className={styles.username}>@{currentUser.username}</div>
      </div>
    </div>
  );
}
