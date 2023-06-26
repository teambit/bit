import React, { HTMLAttributes, useState, ChangeEventHandler, useEffect, useCallback, useRef } from 'react';
import classnames from 'classnames';
import { useLocation } from 'react-router-dom';
import { isEqual } from 'lodash';
import { LaneId } from '@teambit/lane-id';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { LaneModel, LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { InputText as SearchInput } from '@teambit/design.inputs.input-text';
// import { ToggleButton } from '@teambit/design.inputs.toggle-button';
import { Icon } from '@teambit/design.elements.icon';
// import { CheckboxItem } from '@teambit/design.inputs.selectors.checkbox-item';
// import { Tooltip } from '@teambit/design.ui.tooltip';
import { FetchMoreLanes } from '@teambit/lanes.hooks.use-lanes';

import { LaneSelectorList, ListNavigatorCmd } from './lane-selector-list';
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
  scopeIcon?: (scopeName: string) => React.ReactNode;
  // sortBy?: LaneSelectorSortBy;
  // sortOptions?: LaneSelectorSortBy[];
  scopeIconLookup?: Map<string, React.ReactNode>;
  loading?: boolean;
  hasMore?: boolean;
  fetchMoreLanes?: FetchMoreLanes;
  initialOffset?: number;
} & HTMLAttributes<HTMLDivElement>;

export type GroupedLaneDropdownItem = [scope: string, lanes: LaneModel[]];

export type LaneDropdownItems = Array<LaneModel> | Array<GroupedLaneDropdownItem>;

// export enum LaneSelectorSortBy {
//   UPDATED = 'UPDATED',
//   CREATED = 'CREATED',
//   ALPHABETICAL = 'ALPHABETICAL',
// }

export const LIMIT = 5;

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
    // sortBy: sortByFromProps = LaneSelectorSortBy.ALPHABETICAL,
    // sortOptions = [LaneSelectorSortBy.ALPHABETICAL, LaneSelectorSortBy.CREATED],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mainIcon,
    scopeIcon,
    scopeIconLookup,
    loading,
    hasMore,
    fetchMoreLanes,
    initialOffset = 0,
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
  const [lazilyLoadedLanes, setLazilyLoadedLanes] = useState<LaneModel[]>([]);
  const [loadingState, setLoading] = useState<boolean>(loading ?? false);

  useEffect(() => {
    if (loading !== loadingState) setLoading(!!loading);
  }, [loading]);

  useEffect(() => {
    const allNonMainLanes = LanesModel.concatLanes(nonMainLanes, lazilyLoadedLanes);
    if (!isEqual(lazilyLoadedLanes, allNonMainLanes)) {
      setLazilyLoadedLanes(allNonMainLanes);
    }
  }, [nonMainLanes, nonMainLanes.length]);

  const fetchMore = useCallback(async () => {
    setLoading(true);
    const result = await fetchMoreLanes?.(offset, LIMIT);
    setLazilyLoadedLanes((existing) => {
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

  const [filteredLanes, setFilteredLanes] = useState<LaneModel[]>(lazilyLoadedLanes);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [groupScope, setGroupScope] = useState<boolean>(groupByScope);
  const location = useLocation();

  useEffect(() => {
    if (filteredLanes.length !== lazilyLoadedLanes.length) {
      setFilteredLanes(lazilyLoadedLanes);
    }
  }, [lazilyLoadedLanes.length]);

  const multipleLanes = nonMainLanes.length >= 1;

  const handleSearchOnChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    e.stopPropagation();
    const searchTerm = e.target.value;
    if (!searchTerm || searchTerm === '') {
      setFilteredLanes(lazilyLoadedLanes);
    } else {
      setFilteredLanes(() => {
        // first search for items that startWith search term
        let updatedLanes = lazilyLoadedLanes.filter((lane) => {
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
    // prevent dropdown from closing
    e.stopPropagation();
  };

  function LaneSearch() {
    return (
      (multipleLanes && (
        <div className={styles.search}>
          <SearchInput
            activeLabel={false}
            inputSize={'s'}
            // ref={inputRef}
            className={styles.searchInputContainer}
            inputClass={styles.searchInput}
            placeholder={'Search'}
            value={search}
            onChange={handleSearchOnChange}
            onClick={handleSearchOnClick}
            autoFocus={true}
            icon={<Icon of="magnifying" className={styles.searchIcon} />}
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
  const [listNavCmd, setListNavCmd] = useState<{ command?: ListNavigatorCmd; update?: number } | undefined>();

  // const handleKeyDown = (e: KeyboardEvent) => {
  //   setListNavCmd((_listNavCmd) => {
  //     switch (e.key) {
  //       case 'Enter': {
  //         setDropdownOpen(false);
  //         return { command: 'Enter', update: (_listNavCmd?.update ?? 0) + 1 };
  //       }
  //       case 'ArrowUp': {
  //         return { command: 'Up', update: (_listNavCmd?.update ?? 0) + 1 };
  //       }

  //       case 'ArrowDown': {
  //         return { command: 'Down', update: (_listNavCmd?.update ?? 0) + 1 };
  //       }
  //       default:
  //         return _listNavCmd;
  //     }
  //   });
  // };

  // useEffect(() => {
  //   const containerElement = containerRef.current;
  //   if (containerElement) {
  //     containerElement.addEventListener('keydown', handleKeyDown);
  //   }
  //   return () => {
  //     if (containerElement) {
  //       containerElement.removeEventListener('keydown', handleKeyDown);
  //     }
  //   };
  // }, [containerRef.current]);

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
    return (
      <React.Fragment key={'lane-selector-dropdown-root'}>
        {multipleLanes && dropdownOpen && (
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
        )}
        {multipleLanes && dropdownOpen && (
          <LaneSelectorList
            forwardedRef={containerRef}
            hasMore={hasMoreState}
            fetchMore={fetchMore}
            nonMainLanes={filteredLanes}
            search={search}
            // sortBy={sortBy}
            groupByScope={groupScope}
            scopeIconLookup={scopeIconLookup}
            // listNavigator={listNavCmd}
            selectedLaneId={selectedLaneId}
            loading={loading}
            mainLane={mainLane}
            getHref={getHref}
            onLaneSelected={onLaneSelectedHandler}
            scopeIcon={scopeIcon}
            mainIcon={mainIcon}
          />
        )}
      </React.Fragment>
    );
  }, [
    filteredLanes,
    listNavCmd,
    groupByScope,
    multipleLanes,
    selectedLaneId,
    loading,
    hasMore,
    fetchMore,
    dropdownOpen,
  ]);

  return (
    <div {...rest} className={classnames(className, styles.laneSelector)} ref={containerRef}>
      <Dropdown
        dropClass={styles.menu}
        position="bottom"
        clickPlaceholderToggles={multipleLanes}
        clickToggles={multipleLanes}
        open={dropdownOpen}
        onPlaceholderToggle={() => {
          setDropdownOpen((v) => !v);
        }}
        placeholderContent={
          <LanePlaceholder
            loading={loading}
            disabled={!multipleLanes}
            selectedLaneId={selectedLaneId}
            showScope={groupByScope}
          />
        }
        className={classnames(styles.dropdown, !multipleLanes && styles.disabled)}
      >
        {LaneList}
      </Dropdown>
    </div>
  );
}
