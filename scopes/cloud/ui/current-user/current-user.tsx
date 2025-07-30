import React from 'react';
import { UserAvatar } from '@teambit/design.ui.avatar';
import classNames from 'classnames';
import type { CloudUser } from '@teambit/cloud.models.cloud-user';
import styles from './current-user.module.scss';

export type CurrentUserProps = {
  currentUser: CloudUser;
  handleClick: (event: React.SyntheticEvent) => void;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'>;

export function CurrentUser({ currentUser, handleClick, className, ...rest }: CurrentUserProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      handleClick?.(event);
    }
  };
  const handleOnClick = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    handleClick?.(event);
  };
  return (
    <div
      tabIndex={0}
      onClick={handleOnClick}
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
