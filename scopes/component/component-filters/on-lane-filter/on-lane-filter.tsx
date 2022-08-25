import classNames from 'classnames';
import React from 'react';
import { Toggle } from '@teambit/design.ui.input.toggle';
import {
  ComponentFilterCriteria,
  useComponentFilter,
} from '@teambit/component.ui.component-filters.component-filter-context';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';

import styles from './on-lane-filter.module.scss';

export type OnLaneFilterCriteria = ComponentFilterCriteria<boolean>;

export const OnLaneFilter: (defaultState?: boolean) => OnLaneFilterCriteria = (defaultState = false) => ({
  id: 'onLane',
  match: ({ component, lanes }, active) => {
    const onLane = !lanes?.getLaneByComponentVersion(component.id)?.lane.id.isDefault();
    return !active || onLane;
  },
  state: defaultState,
  order: 2,
  render: onLaneFilter,
});

function onLaneFilter({ className }: React.HTMLAttributes<HTMLDivElement>) {
  const filterContext = useComponentFilter<boolean>(OnLaneFilter().id);

  if (!filterContext) return null;

  const [filter, updateFilter] = filterContext;

  const isActive = filter.state;

  return (
    <div className={classNames(styles.onLaneFilter, isActive && styles.active, className)}>
      <div className={styles.filterIcon}>
        <LaneIcon />
        <span className={styles.filterIconLabel}>On Lane</span>
      </div>
      <div>
        <Toggle
          checked={isActive}
          onInputChanged={() => updateFilter((currentState) => ({ ...currentState, state: !isActive }))}
        />
      </div>
    </div>
  );
}
