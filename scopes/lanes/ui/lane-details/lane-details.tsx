import { Subtitle } from '@teambit/documenter.ui.sub-title';
import { ScopeTitle } from '@teambit/scope.ui.scope-title';
import classNames from 'classnames';
import React from 'react';
import { ComponentCount } from '@teambit/component.ui.badges.component-count';
import { LaneId } from '@teambit/lane-id';
import styles from './lane-details.module.scss';

export type LaneDetailsProps = {
  laneId: LaneId;
  description?: string;
  componentCount?: number;
} & React.HTMLAttributes<HTMLDivElement>;

export function LaneDetails({ description, componentCount, className, laneId, ...rest }: LaneDetailsProps) {
  const laneName = laneId.isDefault() ? laneId.name : laneId.toString();

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
      <ComponentCount count={componentCount} />
    </div>
  );
}
