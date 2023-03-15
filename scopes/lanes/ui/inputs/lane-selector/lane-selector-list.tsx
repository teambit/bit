import React, { HTMLAttributes, useMemo } from 'react';
import classnames from 'classnames';
import { compact } from 'lodash';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { ScopeIcon } from '@teambit/scope.ui.scope-icon';
import { LaneDropdownItems, LaneSelectorProps, LaneSelectorSortBy } from './lane-selector';
// import { LaneGroupedMenuItem } from './lane-grouped-menu-item';
import { LaneMenuItem } from './lane-menu-item';

import styles from './lane-selector-list.module.scss';

export type LaneSelectorListProps = {
  search?: string;
} & LaneSelectorProps &
  HTMLAttributes<HTMLDivElement>;

export function LaneSelectorList({
  selectedLaneId,
  mainLane,
  nonMainLanes,
  className,
  groupByScope,
  getHref,
  onLaneSelected,
  search = '',
  mainIcon,
  sortBy,
  sortOptions,
  ...rest
}: LaneSelectorListProps) {
  // do not render the list if there aren't multiple lanes
  if (nonMainLanes.length === 0) return null;

  const selectedNonMainLane =
    (!!selectedLaneId && nonMainLanes.find((nonMainLane) => nonMainLane.id.isEqual(selectedLaneId))) || undefined;

  const laneDropdownItems: LaneDropdownItems = useMemo(() => {
    const lanesToRenderFn = () => {
      const mainLaneToRender =
        search === '' || mainLane?.id.name.toLowerCase().includes(search.toLowerCase()) ? mainLane : undefined;

      if (selectedNonMainLane) {
        const nonMainLanesWithoutSelected = nonMainLanes.filter(
          (nonMainLane) => !nonMainLane.id.isEqual(selectedNonMainLane.id)
        );
        return compact([selectedNonMainLane, mainLaneToRender, ...nonMainLanesWithoutSelected]);
      }

      return compact([mainLaneToRender, ...nonMainLanes]);
    };
    const lanesToRender = lanesToRenderFn();
    return groupByScope ? Array.from(LanesModel.groupLanesByScope(lanesToRender).entries()) : lanesToRender;
  }, [selectedLaneId?.toString(), nonMainLanes.length, search, sortBy]);

  return (
    <div {...rest} className={classnames(className, styles.laneSelectorList)}>
      {/* {groupByScope &&
        (laneDropdownItems as Array<[scope: string, lanes: LaneModel[]]>).map(([scope, lanesByScope]) => (
          <LaneGroupedMenuItem
            key={scope}
            onLaneSelected={onLaneSelected}
            getHref={getHref}
            scope={scope}
            selected={selectedLaneId}
            current={lanesByScope}
          />
        ))} */}
      {!groupByScope &&
        (laneDropdownItems as LaneModel[]).map((lane) => (
          <LaneMenuItem
            onLaneSelected={onLaneSelected}
            key={lane.id.toString()}
            getHref={getHref}
            selected={selectedLaneId}
            current={lane}
            timestamp={sortOptions?.includes(LaneSelectorSortBy.UPDATED) ? lane.updatedAt : lane.createdAt}
            icon={
              lane.id.isDefault() && mainIcon ? (
                <ScopeIcon
                  size={24}
                  scopeImage={mainIcon.iconUrl}
                  bgColor={mainIcon.bgColor}
                  className={styles.mainIcon}
                />
              ) : undefined
            }
          ></LaneMenuItem>
        ))}
    </div>
  );
}
