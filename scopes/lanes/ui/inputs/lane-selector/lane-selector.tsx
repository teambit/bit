import React, { HTMLAttributes, useState, ChangeEventHandler, useEffect } from 'react';
import classnames from 'classnames';
import { LaneId } from '@teambit/lane-id';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { SearchInput } from '@teambit/explorer.ui.search.search-input';
import { LaneModel } from '@teambit/lanes.ui.models.lanes-model';

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
    ...rest
  } = props;
  const [filteredLanes, setFilteredLanes] = useState<LaneModel[]>(nonMainLanes);
  const [search, setSearch] = useState<string>('');
  // const [focus, setFocus] = useState<boolean>(false);

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
      setFilteredLanes(nonMainLanes);
    } else {
      setFilteredLanes(() => {
        // first search for items that startWith search term
        let updatedLanes = nonMainLanes.filter((lane) => {
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
            />
          </div>
        )}
        <LaneSelectorList {...props} nonMainLanes={filteredLanes} search={search} />
      </Dropdown>
    </div>
  );
}
