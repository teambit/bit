import React from 'react';
import classNames from 'classnames';
import { AccountObj } from '../version-block/change-log.data';
import { TimeAgo } from '../../workspace-components/time-ago';
import { UserAvatar } from '../../workspace-components/Avatar';
import styles from './contributors.module.scss';

export type ContributorsProps = {
  contributors: AccountObj[];
  timestamp: string;
};

export function Contributors({ contributors, timestamp }: ContributorsProps) {
  return (
    <div className={styles.row}>
      <div className={styles.avatars}>
        {contributors.map((user, index) => (
          <UserAvatar key={index} size={20} account={user} className={styles.marginRight} />
        ))}
      </div>
      <div className={styles.users}>
        <div className={classNames(styles.marginRight)}>
          {calcUsers(contributors)} <span>released this</span>
        </div>
        <TimeAgo className={styles.marginRight} date={timestamp} />
      </div>
    </div>
  );
}

function calcUsers(contributors: AccountObj[]) {
  if (contributors.length === 1) return <span className={styles.name}>{contributors[0].name}</span>;

  if (contributors.length === 2)
    return (
      <span>
        <span className={styles.name}>{contributors[0].name}</span> and{' '}
        <span className={styles.name}>{contributors[1].name}</span>
      </span>
    );

  return (
    <span>
      <span className={styles.name}>{contributors[0].name}</span> and{' '}
      <span className={styles.name}>{contributors.length - 1} others</span>
    </span>
  );
}
