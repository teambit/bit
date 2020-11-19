import { flatten } from 'lodash';
import { ScopeBadgeSlot } from '@teambit/scope';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-labels.module.scss';

type ScopeLabelsProps = {
  badgeSlot: ScopeBadgeSlot;
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeLabels({ badgeSlot, className }: ScopeLabelsProps) {
  const badges = flatten(badgeSlot.values());

  return (
    <div className={classNames(styles.pillsContainer, className)}>
      {badges.map((badge, key) => {
        const UserBadge = badge;
        return <UserBadge key={key} />;
      })}
    </div>
  );
}
