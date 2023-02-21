import React, { HTMLAttributes, useState, ChangeEventHandler, useEffect } from 'react';
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
  selectedLaneId?: LaneId;
  groupByScope?: boolean;
  getHref?: (laneId: LaneId) => string;
  onLaneSelected?: (laneId: LaneId) => void;
} & HTMLAttributes<HTMLDivElement>;

type LaneDropdownItems = Array<LaneId> | Array<[scope: string, lanes: LaneId[]]>;

export function LaneSelector({
  className,
  lanes,
  selectedLaneId,
  groupByScope = true,
  getHref,
  onLaneSelected,
  ...rest
}: LaneSelectorProps) {
  const [filteredLanes, setFilteredLanes] = useState<LaneId[]>(lanes);
  const [focus, setFocus] = useState<boolean>(false);

  useEffect(() => {
    setFilteredLanes(lanes);
  }, [lanes.length]);

  const multipleLanes = lanes.length > 1;
  const laneDropdownItems: LaneDropdownItems = groupByScope
    ? Array.from(LanesModel.groupByScope(filteredLanes).entries())
    : filteredLanes;

  const handleOnChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    e.stopPropagation();
    const searchTerm = e.target.value;
    if (!searchTerm || searchTerm === '') {
      setFilteredLanes(lanes);
    } else {
      setFilteredLanes((value) => value.filter((laneId) => laneId.name.includes(searchTerm)));
    }
  };

  const onDropdownToggled = (_, open) => {
    setFocus(open);
  };

  return (
    <Dropdown
      {...rest}
      open={!multipleLanes ? false : undefined}
      dropClass={styles.menu}
      elevation="none"
      onChange={multipleLanes ? onDropdownToggled : undefined}
      // @ts-ignore - mismatch between @types/react
      placeholder={
        <LanePlaceholder disabled={!multipleLanes} selectedLaneId={selectedLaneId} showScope={groupByScope} />
      }
      className={classnames(className, styles.dropdown, !multipleLanes && styles.disabled)}
    >
      {multipleLanes && <div className={styles.header}>Switch lane</div>}
      {multipleLanes && (
        <div className={styles.search}>
          <LaneSearch focus={focus} onChange={handleOnChange} />
        </div>
      )}
      <div className={styles.items}>
        {multipleLanes &&
          groupByScope &&
          (laneDropdownItems as Array<[scope: string, lanes: LaneId[]]>).map(([scope, lanesByScope]) => (
            <LaneGroupedMenuItem
              key={scope}
              onLaneSelected={onLaneSelected}
              getHref={getHref}
              scope={scope}
              selected={selectedLaneId}
              current={lanesByScope}
            />
          ))}
        {multipleLanes &&
          !groupByScope &&
          (laneDropdownItems as LaneId[]).map((lane) => (
            <LaneMenuItem
              onLaneSelected={onLaneSelected}
              key={lane.toString()}
              getHref={getHref}
              selected={selectedLaneId}
              current={lane}
            ></LaneMenuItem>
          ))}
      </div>
    </Dropdown>
  );
}
