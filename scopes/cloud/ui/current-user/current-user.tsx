import React from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';
import classNames from 'classnames';
import { CloudUser } from '@teambit/cloud.models.cloud-user';
import styles from './current-user.module.scss';

export type CurrentUserProps = {
  currentUser: CloudUser;
} & React.HTMLAttributes<HTMLDivElement>;

export function CurrentUser({ currentUser: currentUserFromProps, onClick, className, ...rest }: CurrentUserProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      onClick?.(event as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>);
    }
  };
  const currentUser = {
    ...currentUserFromProps,
    displayName: currentUserFromProps.displayName ?? undefined,
    username: currentUserFromProps.username ?? undefined,
    profileImage: currentUserFromProps.profileImage ?? undefined,
  };
  return (
    <div
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      className={classNames(styles.user, className)}
      {...rest}
    >
      <UserAvatar account={currentUser} size={24} />
      <div className={styles.userDetails}>
        <div className={styles.displayName}>{currentUser.displayName || currentUser.username}</div>
        <div className={styles.username}>@{currentUser.username}</div>
      </div>
    </div>
  );
}
