import { AccountObj, UserAvatar } from '@teambit/design.ui.avatar';
import React from 'react';
import styles from './contributors.module.scss';

export type ContributorsProps = {
  contributors: AccountObj[];
} & React.HTMLAttributes<HTMLDivElement>;

export function Contributors({ contributors, ...rest }: ContributorsProps) {
  if (contributors.length === 0) return null;
  const hiddenContributors = contributors.length - 5;
  return (
    <div {...rest} className={styles.contributors}>
      <div>
        <div className={styles.title}>Contributors</div>
        <div className={styles.contributorsCount}>{contributors.length}</div>
      </div>
      <div>
        {contributors.map((user, index) => {
          if (index > 4) return null;
          return <UserAvatar key={index} size={32} account={user} className={styles.avatar} />;
        })}
        {hiddenContributors > 0 && <div className={styles.hiddenContributorsCount}>+{hiddenContributors}</div>}
      </div>
    </div>
  );
}
