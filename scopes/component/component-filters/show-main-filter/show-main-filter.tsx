import classNames from 'classnames';
import React from 'react';
import { Toggle } from '@teambit/design.ui.input.toggle';
import {
  ComponentFilterCriteria,
  ComponentFilterRenderProps,
  useComponentFilter,
} from '@teambit/component.ui.component-filters.component-filter-context';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';

import styles from './show-main-filter.module.scss';

export type ShowMainFilterCriteria = ComponentFilterCriteria<boolean>;

export const ShowMainFilter: (defaultState?: boolean) => ShowMainFilterCriteria = (defaultState = false) => ({
  id: 'onLane',
  match: ({ component, lanes }, active) => {
    const onMain = lanes?.viewedLane?.id.isDefault();
    if (onMain || active) return true;
    const onLane = !!lanes?.isComponentOnLaneButNotOnMain(component.id);
    return onLane;
  },
  state: defaultState,
  order: 2,
  render: showMainFilter,
});

function showMainFilter({ className, lanes }: ComponentFilterRenderProps) {
  const isOnMain = lanes?.viewedLane?.id.isDefault();

  const filterContext = useComponentFilter<boolean>(ShowMainFilter().id);

  if (isOnMain || !filterContext) return null;

  const [filter, updateFilter] = filterContext;

  const isActive = filter.state;

  return (
    <div className={classNames(styles.onLaneFilter, isActive && styles.active, className)}>
      <div className={styles.filterIcon}>
        <LaneIcon />
        <span className={styles.filterIconLabel}>Show Main</span>
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
