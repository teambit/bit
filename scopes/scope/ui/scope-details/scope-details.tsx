import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { ScopeBadgeSlot } from '@teambit/scope';
import { ScopeLabels } from '@teambit/ui.scope-labels';
import { ScopeTitle } from '@teambit/ui.scope-title';
import classNames from 'classnames';
import React from 'react';

import styles from './scope-details.module.scss';

type ScopeDetailsProps = {
  scopeName: string;
  badgeSlot: ScopeBadgeSlot;
  description: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeDetails({ scopeName, badgeSlot, description, className, ...rest }: ScopeDetailsProps) {
  return (
    <div {...rest} className={classNames(styles.scopeTitle, className)}>
      <div className={styles.titleRow}>
        <ScopeTitle scopeName={scopeName} />
      </div>
      <Subtitle>{description}</Subtitle>
      <ScopeLabels badgeSlot={badgeSlot} />
    </div>
  );
}
