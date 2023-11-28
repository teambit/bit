import React from 'react';
import { CircleSkeleton } from '@teambit/base-ui.loaders.skeleton';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { Link } from '@teambit/base-react.navigation.link';
import { useCurrentUser } from './use-current-user';

import styles from './current-user.module.scss';

export type CurrentUserProps = {};

export function CurrentUser() {
  const { currentUser, loginUrl } = useCurrentUser();
  if (currentUser === undefined) {
    return <CircleSkeleton className={styles.loader} />;
  }
  if (!currentUser) return null;
  if (!currentUser.isLoggedIn) {
    return (
      <Link href={loginUrl} external={true}>
        Login
      </Link>
    );
  }
  const profileImageUrl = `${currentUser.profileImage}?size=32&w=64&h=64&crop=faces&fit=crop&bg=ededed`;
  return (
    <Tooltip content={currentUser.displayName} placement="bottom">
      <div className={styles.currentUser}>
        <img src={profileImageUrl}></img>
      </div>
    </Tooltip>
  );
}
