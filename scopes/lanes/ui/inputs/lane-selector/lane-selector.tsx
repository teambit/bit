import React, { HTMLAttributes, useState, ChangeEventHandler, useEffect, useCallback, useMemo } from 'react';
import classnames from 'classnames';
import { LaneId } from '@teambit/lane-id';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { SearchInput } from '@teambit/explorer.ui.search.search-input';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { ToggleButton } from '@teambit/design.inputs.toggle-button';

import { LaneSelectorList } from './lane-selector-list';
import { LanePlaceholder } from './lane-placeholder';

import styles from './lane-selector.module.scss';

export type LaneSelectorProps = {
  nonMainLanes: Array<LaneModel>;
  mainLane?: LaneModel;
  selectedLaneId?: LaneId;
  groupByScope?: boolean;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId) => void;
  mainIcon?: { iconUrl: string; bgColor: string };
  sortBy?: LaneSelectorSortBy;
  sortOptions?: LaneSelectorSortBy[];
} & HTMLAttributes<HTMLDivElement>;

export type GroupedLaneDropdownItem = [scope: string, lanes: LaneModel[]];

export type LaneDropdownItems = Array<LaneModel> | Array<GroupedLaneDropdownItem>;

export enum LaneSelectorSortBy {
  UPDATED = 'UPDATED',
  CREATED = 'CREATED',
  ALPHABETICAL = 'ALPHABETICAL',
}

export function LaneSelector(props: LaneSelectorProps) {
  const {
    className,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mainLane,
    nonMainLanes,
    selectedLaneId,
    groupByScope = true,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getHref,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onLaneSelected,
    sortBy: sortByFromProps = LaneSelectorSortBy.ALPHABETICAL,
    sortOptions = [LaneSelectorSortBy.ALPHABETICAL, LaneSelectorSortBy.CREATED],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mainIcon,
    ...rest
  } = props;
  const compareFn = useCallback((_sortBy: LaneSelectorSortBy) => {
    switch (_sortBy) {
      case LaneSelectorSortBy.UPDATED:
        return (a: LaneModel, b: LaneModel) => {
          return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
        };
      case LaneSelectorSortBy.CREATED:
        return (a: LaneModel, b: LaneModel) => {
          return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        };
      default:
        return (a: LaneModel, b: LaneModel) => {
          return a.id.name.toLowerCase().localeCompare(b.id.name.toLowerCase());
        };
    }
  }, []);

  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<LaneSelectorSortBy>(sortByFromProps);

  const sortedNonMainLanes = useMemo(() => {
    return nonMainLanes.sort(compareFn(sortBy));
  }, [sortBy, nonMainLanes.length]);

  const [filteredLanes, setFilteredLanes] = useState<LaneModel[]>(sortedNonMainLanes);

  useEffect(() => {
    if (filteredLanes.length !== nonMainLanes.length) {
      setFilteredLanes(nonMainLanes);
    }
  }, [nonMainLanes.length]);

  const multipleLanes = nonMainLanes.length > 1;
  // const filteredLaneIds = filteredLanes.map((lane) => lane.id);

  const handleSearchOnChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    e.stopPropagation();
    const searchTerm = e.target.value;
    if (!searchTerm || searchTerm === '') {
      setFilteredLanes(sortedNonMainLanes);
    } else {
      setFilteredLanes(() => {
        // first search for items that startWith search term
        let updatedLanes = sortedNonMainLanes.filter((lane) => {
          const laneName = lane.id.name;
          return laneName.toLowerCase().startsWith(searchTerm.toLowerCase());
        });
        // if nothing matches search anywhere in the string
        if (updatedLanes.length === 0) {
          updatedLanes = nonMainLanes.filter((lane) => {
            const laneName = lane.id.name;
            return laneName.toLowerCase().includes(searchTerm.toLowerCase());
          });
        }
        return [...updatedLanes];
      });
    }
    setSearch(searchTerm || '');
  };

  const handleSearchOnClick = (e) => {
    e.stopPropagation();
  };

  // const onDropdownToggled = (_, open) => {
  //   setFocus(open);
  // };

  return (
    <div {...rest} className={classnames(className, styles.laneSelector)}>
      <Dropdown
        dropClass={styles.menu}
        position="bottom"
        clickToggles={true}
        placeholderContent={
          <LanePlaceholder disabled={!multipleLanes} selectedLaneId={selectedLaneId} showScope={groupByScope} />
        }
        className={classnames(styles.dropdown, !multipleLanes && styles.disabled)}
      >
        {multipleLanes && (
          <div className={styles.search}>
            <SearchInput
              className={styles.searchInput}
              value={search}
              onChange={handleSearchOnChange}
              onClick={handleSearchOnClick}
              autoFocus={true}
            />
          </div>
        )}
        {multipleLanes && (
          <div className={styles.sortAndGroupBy}>
            <div className={styles.groupBy}></div>
            <div className={styles.sort}>
              <ToggleButton
                className={classnames(styles.sortToggle)}
                defaultIndex={sortOptions.indexOf(sortBy)}
                options={sortOptions.map((option) => {
                  return {
                    value: option,
                    icon:
                      option === LaneSelectorSortBy.ALPHABETICAL ? (
                        <img className={styles.sortIcon} src="https://static.bit.cloud/bit-icons/ripple-list.svg" />
                      ) : (
                        <img className={styles.sortIcon} src="https://static.bit.cloud/bit-icons/clock.svg" />
                      ),
                    element: option === LaneSelectorSortBy.ALPHABETICAL ? 'a-Z' : option.toLowerCase(),
                  };
                })}
                onOptionSelect={(index, e) => {
                  e?.stopPropagation();
                  setSortBy(sortOptions[index]);
                  setFilteredLanes((_state) => {
                    const sortedState = _state.sort(compareFn(sortOptions[index]));
                    return [...sortedState];
                  });
                }}
              />
            </div>
          </div>
        )}
        <LaneSelectorList {...props} nonMainLanes={filteredLanes} search={search} sortBy={sortBy} />
      </Dropdown>
    </div>
  );
}
