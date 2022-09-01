import React, { HTMLAttributes, useState, ChangeEventHandler } from 'react';
import classnames from 'classnames';
import { LaneId } from '@teambit/lane-id';
import { Dropdown } from '@teambit/evangelist.surfaces.dropdown';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { LaneMenuItem } from './lane-menu-item';
import { LanePlaceholder } from './lane-placeholder';
import { LaneGroupedMenuItem } from './lane-grouped-menu-item';
import { LaneSearch } from './lane-search';

import styles from './lane-selector.module.scss';

export type LaneSelectorProps = {
  lanes: Array<LaneId>;
  onLaneSelected: (selectedLaneId: LaneId) => () => void;
  selectedLaneId?: LaneId;
  groupByScope?: boolean;
} & HTMLAttributes<HTMLDivElement>;

type LaneDropdownItems = Array<LaneId> | Array<[scope: string, lanes: LaneId[]]>;

export function LaneSelector({
  className,
  lanes,
  selectedLaneId,
  onLaneSelected,
  groupByScope = true,
  ...rest
}: LaneSelectorProps) {
  const [filteredLanes, setFilteredLanes] = useState<LaneId[]>(lanes);
  const [focus, setFocus] = useState<boolean>(false);

  const laneDropdownItems: LaneDropdownItems = groupByScope
    ? Array.from(LanesModel.groupByScope(filteredLanes).entries())
    : filteredLanes;

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    e.stopPropagation();
    const searchTerm = e.target.value;
    if (!searchTerm || searchTerm === '') {
      setFilteredLanes(lanes);
    } else {
      setFilteredLanes((value) => value.filter((laneId) => laneId.toString().includes(searchTerm)));
    }
  };

  const onDropdownToggled = (_, open) => {
    setFocus(open);
  };

  return (
    <Dropdown
      {...rest}
      onChange={onDropdownToggled}
      // @ts-ignore - mismatch between @types/react
      placeholder={<LanePlaceholder selectedLaneId={selectedLaneId} />}
      className={classnames(className, styles.dropdown)}
    >
      <div className={styles.header}>Switch lane</div>
      <div className={styles.search}>
        <LaneSearch focus={focus} onChange={handleOnChange} />
      </div>
      {groupByScope
        ? (laneDropdownItems as Array<[scope: string, lanes: LaneId[]]>).map(([scope, lanesByScope]) => (
            <LaneGroupedMenuItem
              key={scope}
              scope={scope}
              onLaneSelected={onLaneSelected}
              selected={selectedLaneId}
              current={lanesByScope}
            />
          ))
        : (laneDropdownItems as LaneId[]).map((lane) => (
            <LaneMenuItem
              onLaneSelected={onLaneSelected(lane)}
              key={lane.toString()}
              selected={selectedLaneId}
              current={lane}
            ></LaneMenuItem>
          ))}
    </Dropdown>
  );
}
