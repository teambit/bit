import { Icon } from '@teambit/evangelist.elements.icon';
import { ScopeBadgeSlot } from '@teambit/scope';
import { PillLabel } from '@teambit/staged-components.pill-label';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-labels.module.scss';

type ScopeLabelsProps = {
  badgeSlot: ScopeBadgeSlot;
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeLabels({ badgeSlot, className }: ScopeLabelsProps) {
  const badges = badgeSlot.values();

  return (
    <div className={classNames(styles.pillsContainer, className)}>
      {badges.map((badge, key) => {
        const UserBadge = badge.badge;
        if (UserBadge) return <UserBadge key={key} label={badge.label} icon={badge.icon} />;
        return (
          <PillLabel key={key}>
            <Icon of={badge.icon} className={styles.pillIcon} />
            {badge.label}
          </PillLabel>
        );
      })}
    </div>
  );
}
