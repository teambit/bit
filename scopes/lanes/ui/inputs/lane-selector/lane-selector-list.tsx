import React, { HTMLAttributes, useMemo } from 'react';
import classnames from 'classnames';
import { compact } from 'lodash';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneDropdownItems, LaneSelectorProps, LaneSelectorSortBy, GroupedLaneDropdownItem } from './lane-selector';
// import { LaneGroupedMenuItem } from './lane-grouped-menu-item';
import { LaneMenuItem } from './lane-menu-item';

import styles from './lane-selector-list.module.scss';
import { LaneGroupedMenuItem } from './lane-grouped-menu-item';

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
  scopeIconLookup,
  sortBy,
  sortOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scopeIcon,
  ...rest
}: LaneSelectorListProps) {
  const selectedNonMainLane =
    (!!selectedLaneId && nonMainLanes.find((nonMainLane) => nonMainLane.id.isEqual(selectedLaneId))) || undefined;

  const laneDropdownItems: LaneDropdownItems = useMemo(() => {
    if (nonMainLanes.length === 0) return [];

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
    if (groupByScope) {
      const groupedNonMainLanes = LanesModel.groupLanesByScope(nonMainLanes);
      if (selectedNonMainLane) {
        const groupedSelected = groupedNonMainLanes.get(selectedNonMainLane.id.scope) ?? [];
        groupedNonMainLanes.delete(selectedNonMainLane.id.scope);
        const grouped: GroupedLaneDropdownItem[] = [
          [selectedNonMainLane.id.scope, groupedSelected],
          ['', (mainLane && [mainLane]) || []],
          ...groupedNonMainLanes.entries(),
        ];
        return grouped;
      }
      const grouped: GroupedLaneDropdownItem[] = [
        ['', (mainLane && [mainLane]) || []],
        ...groupedNonMainLanes.entries(),
      ];
      return grouped;
    }
    const lanesToRender = lanesToRenderFn();
    return lanesToRender;
  }, [selectedLaneId?.toString(), nonMainLanes.length, search, sortBy, groupByScope]);

  return (
    <div {...rest} className={classnames(className, styles.laneSelectorList)}>
      {groupByScope &&
        (laneDropdownItems as Array<[scope: string, lanes: LaneModel[]]>).map(([scope, lanesByScope]) => {
          return (
            <LaneGroupedMenuItem
              key={scope ?? 'main'}
              onLaneSelected={onLaneSelected}
              getHref={getHref}
              scope={scope}
              selected={selectedLaneId}
              current={lanesByScope}
              icon={scopeIconLookup?.get(scope)}
              timestamp={(lane) =>
                sortOptions?.includes(LaneSelectorSortBy.UPDATED) ? lane.updatedAt : lane.createdAt
              }
            />
          );
        })}
      {!groupByScope &&
        (laneDropdownItems as LaneModel[]).map((lane) => (
          <LaneMenuItem
            onLaneSelected={onLaneSelected}
            key={lane.id.toString()}
            getHref={getHref}
            selected={selectedLaneId}
            current={lane}
            timestamp={sortOptions?.includes(LaneSelectorSortBy.UPDATED) ? lane.updatedAt : lane.createdAt}
            icon={(lane.id.isDefault() && mainIcon) || undefined}
          ></LaneMenuItem>
        ))}
    </div>
  );
}
