import type { HTMLAttributes } from 'react';
import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import classnames from 'classnames';
import { compact, isFunction } from 'lodash';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import type { LaneId } from '@teambit/lane-id';
import type { FetchMoreLanesResult } from '@teambit/lanes.hooks.use-lanes';
import type { LaneDropdownItems, GroupedLaneDropdownItem } from './lane-selector';
import { LaneMenuItem } from './lane-menu-item';
import { LaneGroupedMenuItem } from './lane-grouped-menu-item';

import styles from './lane-selector-list.module.scss';

export type LaneSelectorListProps = {
  selectedLaneId?: LaneId;
  mainLane?: LaneModel;
  nonMainLanes: LaneModel[];
  className?: string;
  groupByScope?: boolean;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (selectedLaneId: LaneId, selectedLane: LaneModel) => void;
  search?: string;
  mainIcon?: React.ReactNode;
  scopeIconLookup?: Map<string, React.ReactNode>;
  loading?: boolean;
  hasMore: boolean;
  fetchMore: () => Promise<FetchMoreLanesResult | undefined>;
  fetchMoreLanes?: () => Promise<FetchMoreLanesResult | undefined>;
  initialOffset?: number;
  forwardedRef?: React.Ref<HTMLDivElement>;
} & HTMLAttributes<HTMLDivElement>;

export const LaneSelectorList = React.forwardRef<HTMLDivElement, LaneSelectorListProps>(function _(props, ref) {
  return <_LaneSelectorList {...props} forwardedRef={ref} />;
});

export function _LaneSelectorList({
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
  loading,
  hasMore,
  fetchMore,
  forwardedRef,
  ...rest
}: LaneSelectorListProps) {
  const navigate = useNavigate();
  const observer = useRef<IntersectionObserver | null>(null);
  const laneDOMRefs = useRef<Map<string, React.RefObject<HTMLDivElement>>>(new Map());
  const laneRefs = useRef<LaneId[]>([]);
  const lastLaneDomRef = useRef<HTMLDivElement | null>(null);

  const lastLaneElementRef = useCallback(
    (node) => {
      if (loading) return;
      observer.current?.disconnect();
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMore) {
          fetchMore().catch(() => {});
        }
      });
      if (node) {
        observer.current.observe(node);
        lastLaneDomRef.current = node;
      }
    },
    [loading, hasMore, fetchMore]
  );

  const selectedNonMainLane =
    (!!selectedLaneIdFromProps &&
      nonMainLanes.find((nonMainLane) => nonMainLane.id.isEqual(selectedLaneIdFromProps))) ||
    undefined;

  const [selectedLaneId, setSelectedLaneId] = useState<LaneId | undefined>(selectedLaneIdFromProps);

  useEffect(() => {
    if (selectedLaneIdFromProps && selectedLaneIdFromProps?.toString() !== selectedLaneId?.toString()) {
      setSelectedLaneId(selectedLaneIdFromProps);
    }
  }, [selectedLaneIdFromProps?.toString()]);

  const laneDropdownItems: LaneDropdownItems = useMemo(() => {
    laneRefs.current = [];

    if (nonMainLanes.length === 0) return [];

    const isSearchMatch = (lane?: LaneModel) =>
      search === '' || lane?.id.name.toLowerCase().includes(search.toLowerCase());

    const createLaneRefs = (lanes: LaneModel[]) => {
      lanes.forEach((lane, index) => {
        const isLastLane = index === lanes.length - 1;
        const ref: any = isLastLane ? lastLaneElementRef : React.createRef<HTMLDivElement>();
        laneDOMRefs.current.set(lane.id.toString(), ref);
        laneRefs.current.push(lane.id);
      });
    };

    if (groupByScope) {
      const groupedNonMainLanes = LanesModel.groupLanesByScope(nonMainLanes);
      let grouped: GroupedLaneDropdownItem[] = [];

      if (selectedNonMainLane) {
        const selectedScopeLanes = groupedNonMainLanes.get(selectedNonMainLane.id.scope) ?? [];
        const selectedScopeLanesWithoutSelected = selectedScopeLanes.filter(
          (lane) => !lane.id.isEqual(selectedNonMainLane.id)
        );
        groupedNonMainLanes.set(selectedNonMainLane.id.scope, selectedScopeLanesWithoutSelected);

        const selectedGroup = [selectedNonMainLane.id.scope, [selectedNonMainLane]] as GroupedLaneDropdownItem;
        const mainGroup = mainLane ? (['', [mainLane]] as GroupedLaneDropdownItem) : undefined;

        const remainingGroups = Array.from(groupedNonMainLanes.entries()).map(
          ([scope, lanes]) => [scope, lanes] as GroupedLaneDropdownItem
        );

        grouped = compact([selectedGroup, mainGroup, ...remainingGroups]);
      } else {
        const mainGroup = mainLane ? (['', [mainLane]] as GroupedLaneDropdownItem) : undefined;
        const remainingGroups = Array.from(groupedNonMainLanes.entries()).map(
          ([scope, lanes]) => [scope, lanes] as GroupedLaneDropdownItem
        );

        grouped = compact([mainGroup, ...remainingGroups]);
      }

      grouped.forEach(([, lanes]) => createLaneRefs(lanes));

      return grouped;
    }

    let lanesToRender = nonMainLanes;

    if (mainLane && isSearchMatch(mainLane)) {
      lanesToRender = lanesToRender.filter((lane) => lane.id.toString() !== mainLane.id.toString());
      lanesToRender.unshift(mainLane);
    }

    if (selectedNonMainLane) {
      lanesToRender = lanesToRender.filter((lane) => !lane.id.isEqual(selectedNonMainLane.id));
      lanesToRender.unshift(selectedNonMainLane);
    }

    createLaneRefs(lanesToRender);

    return lanesToRender;
  }, [
    nonMainLanes.length,
    search,
    groupByScope,
    selectedNonMainLane?.id.toString(),
    lastLaneElementRef,
    mainLane?.id.name,
  ]);

  useEffect(() => {
    if (selectedLaneId) {
      setTimeout(() => {
        const lastLaneRef = laneRefs.current.slice(-1)[0];
        if (selectedLaneId.toString() === lastLaneRef?.toString()) {
          lastLaneDomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
        const selectedLaneElement = laneDOMRefs.current.get(selectedLaneId.toString())?.current;
        selectedLaneElement?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 0);
    }
  }, [selectedLaneId?.toString(), laneDropdownItems]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Enter': {
          setSelectedLaneId((currentSelectedLaneId) => {
            const selectedLane =
              (currentSelectedLaneId &&
                nonMainLanes.find((nonMainLane) => nonMainLane.id.isEqual(currentSelectedLaneId))) ||
              mainLane;
            currentSelectedLaneId && selectedLane && onLaneSelected?.(currentSelectedLaneId, selectedLane);
            currentSelectedLaneId && selectedLane && navigate(getHref(currentSelectedLaneId));
            return currentSelectedLaneId;
          });
          break;
        }
        case 'ArrowUp': {
          setSelectedLaneId((currentSelectedLaneId) => {
            const selectedIndex = currentSelectedLaneId
              ? laneRefs.current.findIndex((lane) => lane.toString() === currentSelectedLaneId.toString())
              : undefined;
            const updatedIndex =
              (selectedIndex !== undefined &&
                (laneRefs.current[selectedIndex - 1] ? selectedIndex - 1 : laneRefs.current.length - 1)) ||
              0;
            return laneRefs.current[updatedIndex];
          });
          break;
        }

        case 'ArrowDown': {
          setSelectedLaneId((currentSelectedLaneId) => {
            const selectedIndex = currentSelectedLaneId
              ? laneRefs.current.findIndex((lane) => lane.toString() === currentSelectedLaneId.toString())
              : undefined;
            const updatedIndex =
              (selectedIndex !== undefined && (laneRefs.current[selectedIndex + 1] ? selectedIndex + 1 : 0)) || 0;
            return laneRefs.current[updatedIndex];
          });
          break;
        }
        default:
          break;
      }
    },
    [nonMainLanes, nonMainLanes.length, laneRefs.current.length]
  );

  useEffect(() => {
    const containerElement = forwardedRef && !isFunction(forwardedRef) ? forwardedRef?.current : undefined;

    if (containerElement) {
      containerElement?.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      if (containerElement) {
        containerElement?.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [forwardedRef]);

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
              timestamp={(lane) => lane.updatedAt || lane.createdAt}
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
            timestamp={lane.updatedAt || lane.createdAt}
            icon={(lane.id.isDefault() && mainIcon) || undefined}
          ></LaneMenuItem>
        ))}
    </div>
  );
}
