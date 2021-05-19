import { UserAvatar, AccountObj } from '@teambit/design.ui.avatar';
import { TimeAgo } from '@teambit/design.ui.time-ago';
import classNames from 'classnames';
import React from 'react';

import styles from './contributors.module.scss';

export type ContributorsProps = {
  contributors: AccountObj[];
  timestamp: string;
};

export function Contributors({ contributors = [], timestamp }: ContributorsProps) {
  return (
    <div className={styles.row}>
      {contributors.slice(0, 3).map((user, index) => (
        <UserAvatar key={index} size={20} account={user || {}} className={styles.marginRight} />
      ))}
      <div className={classNames(styles.marginRight)}>
        {calcUsers(contributors)} <span>released this</span>
      </div>
      <TimeAgo className={styles.marginRight} date={timestamp} />
    </div>
  );
}

function calcUsers(contributors: AccountObj[]) {
  if (contributors.length === 1) return singleUserName(contributors[0]);

  if (contributors.length === 2)
    return (
      <span>
        {singleUserName(contributors[0])} and {singleUserName(contributors[1])}
      </span>
    );

  return (
    <span>
      {singleUserName(contributors[0])} and <span className={styles.name}>{contributors.length - 1} others</span>
    </span>
  );
}

function singleUserName(user: AccountObj) {
  if (user.displayName) return <span className={classNames(styles.name, styles.displayName)}>{user.displayName}</span>;
  if (!user.name) return <span className={styles.name}>unknown</span>;
  return <span className={styles.name}>{user.name}</span>;
}
