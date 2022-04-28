import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { ScopeTitle } from '@teambit/scope.ui.scope-title';
import classNames from 'classnames';
import React from 'react';
import { PillLabel } from '@teambit/design.ui.pill-label';
import styles from './lane-details.module.scss';

export type LaneDetailsProps = {
  laneName: string;
  description?: string;
  componentCount?: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function LaneDetails({ description, componentCount, className, laneName, ...rest }: LaneDetailsProps) {
  return (
    <div {...rest} className={classNames(styles.laneTitle, className)}>
      <div className={styles.titleRow}>
        <ScopeTitle
          scopeName={laneName}
          icon={'https://static.bit.dev/bit-icons/lane.svg'}
          backgroundIconColor={'unset'}
          iconClassName={styles.laneIcon}
        />
      </div>
      <Subtitle>{description}</Subtitle>
      {
        // scopes/component/ui/badges/component-count
        componentCount && (
          <div className={classNames(styles.pillsContainer)}>
            <PillLabel>
              <span className={styles.componentCount}>{componentCount}</span>
              <span>Components</span>
            </PillLabel>
          </div>
        )
      }
    </div>
  );
}
