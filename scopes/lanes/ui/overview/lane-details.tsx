import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { ScopeTitle } from '@teambit/scope.ui.scope-title';
import classNames from 'classnames';
import React from 'react';
import { PillLabel } from '@teambit/design.ui.pill-label';
import styles from './lane-details.module.scss';

export type LaneDetailsProps = {
  laneName: string;
  icon?: string;
  description?: string;
  componentCount: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function LaneDetails({ icon, description, componentCount, className, laneName, ...rest }: LaneDetailsProps) {
  return (
    <div {...rest} className={classNames(styles.laneTitle, className)}>
      <div className={styles.titleRow}>
        <ScopeTitle scopeName={laneName} icon={icon} />
      </div>
      <Subtitle>{description}</Subtitle>
      <div className={classNames(styles.pillsContainer, className)}>
        {componentCount && (
          <PillLabel>
            <span className={styles.componentCount}>{componentCount}</span>
            <span>Components</span>
          </PillLabel>
        )}
      </div>
    </div>
  );
}
