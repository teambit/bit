import type { HTMLAttributes, ChangeEventHandler } from 'react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import classnames from 'classnames';
import { useLocation } from 'react-router-dom';
import { isEqual } from 'lodash';
import type { LaneId } from '@teambit/lane-id';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import type { LaneModel } from '@teambit/lanes.ui.models.lanes-model';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { InputText as SearchInput } from '@teambit/design.inputs.input-text';
import Fuse from 'fuse.js';
// import { ToggleButton } from '@teambit/design.inputs.toggle-button';
import { Icon } from '@teambit/design.elements.icon';
// import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
// import { Tooltip } from '@teambit/design.ui.tooltip';
import type { FetchMoreLanes } from '@teambit/lanes.hooks.use-lanes';

import { LaneSelectorList } from './lane-selector-list';
import { LanePlaceholder } from './lane-placeholder';

import styles from './lane-selector.module.scss';

export type LaneSelectorProps = {
  nonMainLanes: Array<LaneModel>;
  mainLane?: LaneModel;
  selectedLaneId?: LaneId;
  groupByScope?: boolean;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId, lane: LaneModel) => void;
  mainIcon?: React.ReactNode;
  scopeIconLookup?: Map<string, React.ReactNode>;
  loading?: boolean;
  hasMore?: boolean;
  fetchMoreLanes?: FetchMoreLanes;
  initialOffset?: number;
  searchLanes?: (search?: string) => LanesModel | undefined | null;
  placeholderText?: string;
} & HTMLAttributes<HTMLDivElement>;

export type GroupedLaneDropdownItem = [scope: string, lanes: LaneModel[]];

export type LaneDropdownItems = Array<LaneModel> | Array<GroupedLaneDropdownItem>;

// export enum LaneSelectorSortBy {
//   UPDATED = 'UPDATED',
//   CREATED = 'CREATED',
//   ALPHABETICAL = 'ALPHABETICAL',
// }

export const LIMIT = 5;
const DEFAULT_SEARCH_ICON = 'magnifying';
const CLEAR_SEARCH_ICON = 'crossmark';

export function LaneSelector(props: LaneSelectorProps) {
  const {
    className,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mainLane,
    nonMainLanes,
    selectedLaneId,
    groupByScope = true,
    getHref,
    onLaneSelected,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mainIcon,
    scopeIconLookup,
    loading,
    hasMore,
    fetchMoreLanes,
    searchLanes: searchLanesFromProps,
    initialOffset = 0,
    placeholderText,
    ...rest
  } = props;
  // const compareFn = useCallback((_sortBy: LaneSelectorSortBy) => {
  //   switch (_sortBy) {
  //     case LaneSelectorSortBy.UPDATED:
  //       return (a: LaneModel, b: LaneModel) => {
  //         return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0);
  //       };
  //     case LaneSelectorSortBy.CREATED:
  //       return (a: LaneModel, b: LaneModel) => {
  //         return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
  //       };
  //     default:
  //       return (a: LaneModel, b: LaneModel) => {
  //         const scopeCompareResult = a.id.scope.localeCompare(b.id.scope);
  //         if (groupByScope && scopeCompareResult !== 0) return scopeCompareResult;
  //         return a.id.name.toLowerCase().localeCompare(b.id.name.toLowerCase());
  //       };
  //   }
  // }, []);

  const [search, setSearch] = useState<string>('');
  // const [sortBy, setSortBy] = useState<LaneSelectorSortBy>(sortByFromProps);
  const [offset, setOffset] = useState(initialOffset ?? 0);
  const [hasMoreState, setHasMore] = useState<boolean>(hasMore ?? false);
  const [allLanes, setAllLanes] = useState<LaneModel[]>([]);
  const [loadingState, setLoading] = useState<boolean>(loading ?? false);

  const defaultSearchLanes = React.useCallback(
    (searchParam?: string) => {
      if (!searchParam)
        return new LanesModel({
          lanes: allLanes,
          defaultLane: allLanes.find((lane) => lane.id.isDefault()),
        });

      const fuseOptions = {
        keys: ['id.name', 'id.scope', 'log.username', 'log.email', 'log.displayName'],
        threshold: searchParam.length === 1 ? 0 : 0.3,
        findAllMatches: true,
        location: 0,
        distance: searchParam.length === 1 ? 0 : 100,
        minMatchCharLength: 1,
        ignoreLocation: true,
        shouldSort: false,
        includeScore: true,
      };

      const fuse = new Fuse(allLanes, fuseOptions);
      const lanes = fuse.search(searchParam).map((result) => result.item);
      return new LanesModel({ lanes, defaultLane: lanes.find((lane) => lane.id.isDefault()) });
    },
    [allLanes]
  );

  const searchLanes = searchLanesFromProps ?? defaultSearchLanes;

  useEffect(() => {
    if (hasMore !== hasMoreState) setHasMore(Boolean(hasMore));
  }, [hasMore]);

  useEffect(() => {
    if (loading !== loadingState) setLoading(!!loading);
  }, [loading]);

  useEffect(() => {
    const allNonMainLanes = LanesModel.concatLanes(nonMainLanes, allLanes);
    if (!isEqual(allLanes, allNonMainLanes)) {
      setAllLanes(allNonMainLanes);
    }
  }, [nonMainLanes, nonMainLanes.length]);

  const fetchMore = useCallback(async () => {
    setLoading(true);
    const result = await fetchMoreLanes?.(offset, LIMIT);
    setAllLanes((existing) => {
      setHasMore(() => {
        setLoading(!!result?.loading);
        setOffset(result?.nextOffset ?? 0);
        return result?.hasMore ?? false;
      });
      const updatedLanes = LanesModel.concatLanes(existing, result?.lanesModel?.lanes);
      return updatedLanes.filter((lane) => !lane.id.isDefault()) ?? [];
    });
    return result;
  }, [offset, fetchMoreLanes]);

  // const sortedNonMainLanes = useMemo(() => {
  //   return lazilyLoadedLanes.sort(compareFn(sortBy));
  // }, [sortBy, lazilyLoadedLanes]);

  const [filteredLanes, setFilteredLanes] = useState<LaneModel[]>(allLanes);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [groupScope, setGroupScope] = useState<boolean>(groupByScope);
  const location = useLocation();

  useEffect(() => {
    if (filteredLanes.length !== allLanes.length) {
      setFilteredLanes(allLanes);
    }
  }, [allLanes.length]);

  const multipleLanes = React.useMemo(() => nonMainLanes.length >= 1, [nonMainLanes.length]);
  const searchIconRef = useRef<string>(DEFAULT_SEARCH_ICON);
  const searchedLanes = searchLanes?.(search);

  const handleSearchOnChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    e.stopPropagation();
    const searchTerm = e.target.value;
    if (!searchTerm || searchTerm === '') {
      searchIconRef.current = DEFAULT_SEARCH_ICON;
      // setFilteredLanes(allLanes);
    } else {
      searchIconRef.current = CLEAR_SEARCH_ICON;
      // setFilteredLanes(() => {
      //   const options = {
      //     keys: ['id.name', 'displayName'],
      //     includeMatches: true,
      //     findAllMatches: true,
      //     threshold: 0.4,
      //     location: 0,
      //     distance: 100,
      //     minMatchCharLength: 1,
      //     ignoreLocation: false,
      //     shouldSort: true,
      //     useExtendedSearch: true,
      //   };

      //   const fuse = new Fuse(allLanes, options);
      //   const result = fuse.search(searchTerm);
      //   const updatedLanes = result.map((matchedLane) => matchedLane.item);

      //   return [...updatedLanes];
      // });
    }
    setSearch(searchTerm || '');
  };

  const handleSearchIconClicked = (e) => {
    // prevent dropdown from closing
    e.stopPropagation();
    if (searchIconRef.current !== CLEAR_SEARCH_ICON) return;
    setSearch('');
    searchIconRef.current = DEFAULT_SEARCH_ICON;
    setFilteredLanes(allLanes);
  };

  const handleSearchOnClick = (e) => {
    // prevent dropdown from closing
    e.stopPropagation();
  };

  function LaneSearch() {
    const isClear = searchIconRef.current === CLEAR_SEARCH_ICON;

    return (
      (multipleLanes && (
        <div className={styles.search}>
          <SearchInput
            activeLabel={false}
            inputSize={'s'}
            // ref={inputRef}
            className={classnames(styles.searchInputContainer, isClear && styles.pointer)}
            inputClass={styles.searchInput}
            placeholder={'Search'}
            value={search}
            onChange={handleSearchOnChange}
            onClick={handleSearchOnClick}
            autoFocus={true}
            icon={<Icon of={searchIconRef.current} className={styles.searchIcon} onClick={handleSearchIconClicked} />}
          />
        </div>
      )) ||
      null
    );
  }
  // TBD: needs redesign

  // function LaneGroup() {
  //   return (
  //     <div className={styles.group}>
  //       <CheckboxItem
  //         checked={groupByScope}
  //         onInputChanged={(e) => {
  //           // prevent dropdown from closing
  //           setGroupScope((v) => !v);
  //           e.stopPropagation();
  //         }}
  //       >
  //         <div className={styles.groupText}>Group By Scope</div>
  //       </CheckboxItem>
  //     </div>
  //   );
  // }

  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState<boolean | undefined>(false);

  useEffect(() => {
    setDropdownOpen(() => {
      return false;
    });
  }, [location.pathname]);

  const onLaneSelectedHandler = (laneId: LaneId, lane: LaneModel) => {
    setDropdownOpen(() => {
      onLaneSelected?.(laneId, lane);
      return false;
    });
  };

  const LaneList = React.useMemo(() => {
    if (!multipleLanes && !dropdownOpen) return null;

    return (
      <React.Fragment key={'lane-selector-dropdown-root'}>
        <div className={styles.toolbar}>
          {/* {multipleLanes && groupByScope && (
              <div className={styles.groupBy}>
                <LaneGroup />
              </div>
            )} */}
          <LaneSearch />
          {/* <div className={styles.sort}>
              <ToggleButton
                className={classnames(styles.sortToggle)}
                defaultIndex={sortOptions.indexOf(sortBy)}
                options={sortOptions.map((option) => {
                  return {
                    value: option,
                    icon:
                      option === LaneSelectorSortBy.ALPHABETICAL ? (
                        <Tooltip placement={'bottom'} content={`Sort by Lane ID (A-Z)`}>
                          <img className={styles.sortIcon} src="https://static.bit.cloud/bit-icons/ripple-list.svg" />
                        </Tooltip>
                      ) : (
                        <Tooltip placement={'bottom'} content={`Sort by ${startCase(option.toLowerCase())} Date`}>
                          <img className={styles.sortIcon} src="https://static.bit.cloud/bit-icons/clock.svg" />
                        </Tooltip>
                      ),
                    element: null,
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
            </div> */}
        </div>
        <LaneSelectorList
          ref={containerRef}
          hasMore={search ? false : hasMoreState}
          fetchMore={fetchMore}
          nonMainLanes={searchedLanes?.lanes && searchedLanes?.lanes.length > 0 ? searchedLanes.lanes : filteredLanes}
          search={search}
          groupByScope={groupScope}
          scopeIconLookup={scopeIconLookup}
          selectedLaneId={selectedLaneId}
          loading={loading}
          mainLane={mainLane}
          getHref={getHref}
          onLaneSelected={onLaneSelectedHandler}
          mainIcon={mainIcon}
        />
      </React.Fragment>
    );
  }, [
    filteredLanes,
    groupByScope,
    multipleLanes,
    selectedLaneId,
    loading,
    hasMore,
    fetchMore,
    dropdownOpen,
    searchedLanes,
  ]);

  return (
    <div {...rest} className={classnames(className, styles.laneSelector)} ref={containerRef}>
      <Dropdown
        dropClass={styles.menu}
        position="bottom"
        clickPlaceholderToggles={multipleLanes}
        onClickOutside={() => setDropdownOpen(false)}
        clickToggles={multipleLanes}
        open={dropdownOpen}
        onPlaceholderToggle={React.useCallback(() => {
          if (!multipleLanes) return;
          setDropdownOpen((v) => !v);
        }, [multipleLanes])}
        placeholderContent={
          <LanePlaceholder
            loading={loading}
            disabled={!multipleLanes}
            selectedLaneId={selectedLaneId}
            showScope={groupByScope}
            placeholderText={placeholderText}
          />
        }
        className={classnames(styles.dropdown, !multipleLanes && styles.disabled)}
      >
        {LaneList}
      </Dropdown>
    </div>
  );
}
