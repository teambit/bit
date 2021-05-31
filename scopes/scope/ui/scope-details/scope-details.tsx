import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { flatten } from 'lodash';
import type { ScopeBadgeSlot, OverviewLineSlot } from '@teambit/scope';
import { ScopeLabels } from '@teambit/scope.ui.scope-labels';
import { ScopeTitle } from '@teambit/scope.ui.scope-title';
import classNames from 'classnames';
import React, { useMemo } from 'react';

import styles from './scope-details.module.scss';

type ScopeDetailsProps = {
  scopeName: string;
  icon?: string;
  badgeSlot: ScopeBadgeSlot;
  description: string;
  componentCount: number;
  overviewSlot: OverviewLineSlot;
} & React.HTMLAttributes<HTMLDivElement>;

export function ScopeDetails({
  scopeName,
  icon,
  badgeSlot,
  overviewSlot,
  description,
  componentCount,
  className,
  ...rest
}: ScopeDetailsProps) {
  const overviewItems = useMemo(() => flatten(overviewSlot.values()), [overviewSlot]);
  return (
    <div {...rest} className={classNames(styles.scopeTitle, className)}>
      <div className={styles.titleRow}>
        <ScopeTitle scopeName={scopeName} icon={icon} />
      </div>
      <Subtitle>{description}</Subtitle>
      <ScopeLabels badgeSlot={badgeSlot} componentCount={componentCount} />
      {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
    </div>
  );
}
