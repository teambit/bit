import React, { HTMLAttributes, useMemo, useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import classnames from 'classnames';
import { compact } from 'lodash';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneId } from '@teambit/lane-id';
import { LaneDropdownItems, LaneSelectorProps, LaneSelectorSortBy, GroupedLaneDropdownItem } from './lane-selector';
import { LaneMenuItem } from './lane-menu-item';
import { LaneGroupedMenuItem } from './lane-grouped-menu-item';

import styles from './lane-selector-list.module.scss';

export type ListNavigatorCmd = 'Up' | 'Down' | 'Enter';

export type LaneSelectorListProps = {
  search?: string;
  listNavigator?: {
    command?: ListNavigatorCmd;
    update?: number;
  };
} & LaneSelectorProps &
  HTMLAttributes<HTMLDivElement>;

export function LaneSelectorList({
  selectedLaneId: selectedLaneIdFromProps,
  mainLane,
  nonMainLanes,
  className,
  groupByScope,
  getHref = LanesModel.getLaneUrl,
  onLaneSelected,
  search = '',
  mainIcon,
  scopeIconLookup,
  sortBy,
  sortOptions,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scopeIcon,
  listNavigator,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  forceCloseOnEnter,
  loading,
  ...rest
}: LaneSelectorListProps) {
  const navigate = useNavigate();
  const selectedNonMainLane =
    (!!selectedLaneIdFromProps &&
      nonMainLanes.find((nonMainLane) => nonMainLane.id.isEqual(selectedLaneIdFromProps))) ||
    undefined;
  const laneDOMRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const laneRefs = useRef<LaneId[]>([]);

  const [selectedLaneId, setSelectedLaneId] = useState<LaneId | undefined>(selectedLaneIdFromProps);

  useEffect(() => {
    if (selectedLaneIdFromProps && selectedLaneIdFromProps?.toString() !== selectedLaneId?.toString()) {
      setSelectedLaneId(selectedLaneIdFromProps);
    }
  }, [selectedLaneIdFromProps?.toString()]);

  const laneDropdownItems: LaneDropdownItems = useMemo(() => {
    laneRefs.current = [];

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

      grouped.forEach(([, lanes]) => {
        lanes.forEach((lane) => {
          laneDOMRefs.current.set(lane.id.toString(), React.createRef<HTMLDivElement>());
          laneRefs.current.push(lane.id);
        });
      });

      return grouped;
    }
    const lanesToRender = lanesToRenderFn();
    lanesToRender.forEach((lane) => {
      laneDOMRefs.current.set(lane.id.toString(), React.createRef<HTMLDivElement>());
      laneRefs.current.push(lane.id);
    });
    return lanesToRender;
  }, [
    nonMainLanes.length,
    search,
    sortBy,
    groupByScope,
    selectedLaneId?.toString(),
    selectedNonMainLane?.id.toString(),
  ]);

  useEffect(() => {
    const selectedIndex = selectedLaneId
      ? laneRefs.current.findIndex((lane) => lane.toString() === selectedLaneId.toString())
      : undefined;

    switch (listNavigator?.command) {
      case 'Enter': {
        selectedLaneId && onLaneSelected?.(selectedLaneId);
        selectedLaneId && navigate(getHref(selectedLaneId));
        break;
      }
      case 'Up': {
        const updatedIndex =
          (selectedIndex !== undefined &&
            (laneRefs.current[selectedIndex - 1] ? selectedIndex - 1 : laneRefs.current.length - 1)) ||
          0;
        setSelectedLaneId(laneRefs.current[updatedIndex]);
        break;
      }

      case 'Down': {
        const updatedIndex =
          (selectedIndex !== undefined && (laneRefs.current[selectedIndex + 1] ? selectedIndex + 1 : 0)) || 0;
        setSelectedLaneId(laneRefs.current[updatedIndex]);

        break;
      }
      default:
        break;
    }
  }, [listNavigator?.update, listNavigator?.command]);

  useEffect(() => {
    if (selectedLaneId) {
      const selectedLaneElement = laneDOMRefs.current.get(selectedLaneId.toString())?.current;
      selectedLaneElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedLaneId?.toString()]);

  if (loading) return null;

  return (
    <div {...rest} className={classnames(className, styles.laneSelectorList)}>
      {groupByScope &&
        (laneDropdownItems as Array<[scope: string, lanes: LaneModel[]]>).map(([scope, lanesByScope], index) => {
          return (
            <LaneGroupedMenuItem
              key={`${scope ?? 'main'}-${index}`}
              onLaneSelected={onLaneSelected}
              getHref={getHref}
              scope={scope}
              selected={selectedLaneId}
              current={lanesByScope}
              icon={scopeIconLookup?.get(scope)}
              timestamp={(lane) =>
                sortOptions?.includes(LaneSelectorSortBy.UPDATED) ? lane.updatedAt : lane.createdAt
              }
              innerRefs={(laneId) => {
                return laneDOMRefs.current.get(laneId.toString());
              }}
            />
          );
        })}
      {!groupByScope &&
        (laneDropdownItems as LaneModel[]).map((lane, index) => (
          <LaneMenuItem
            ref={laneDOMRefs.current.get(lane.id.toString())}
            onLaneSelected={onLaneSelected}
            key={`${lane.id.toString()}-${index}`}
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
