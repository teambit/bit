import React, { HTMLAttributes, useRef, useEffect } from 'react';
import classnames from 'classnames';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { LanesIcon } from '@teambit/lanes.ui.icon';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { DEFAULT_LANE, LanesModel } from '@teambit/lanes.ui.models';
import { Icon } from '@teambit/evangelist.elements.icon';
import { MenuLinkItem } from '@teambit/design.ui.surfaces.menu.link-item';

import styles from './lanes-list.dropdown.module.scss';

export type LanesListDropdownProps = {} & HTMLAttributes<HTMLDivElement>;

export function LanesListDropdown({ className, ...rest }: LanesListDropdownProps) {
  const { lanesModel } = useLanes();
  const defaultLane = { id: DEFAULT_LANE, url: '/' };
  const viewedLane =
    (lanesModel?.viewedLane && {
      id: lanesModel?.viewedLane.id,
      url: LanesModel.getLaneUrl(lanesModel.viewedLane.id),
    }) ||
    defaultLane;
  const availableLanes = [
    defaultLane,
    ...(lanesModel?.lanes || []).map((lane) => ({ id: lane.id, url: LanesModel.getLaneUrl(lane.id) })),
  ] || [defaultLane];

  return (
    <Dropdown
      {...rest}
      // @ts-ignore - mismatch between @types/react
      placeholder={<Placeholder viewedLaneId={viewedLane.id} />}
      className={classnames(className, styles.dropdown)}
    >
      {availableLanes.map((lane) => (
        <MenuItem key={lane.id} selected={viewedLane} current={lane}></MenuItem>
      ))}
    </Dropdown>
  );
}

type PlaceholderProps = { viewedLaneId: string } & React.HTMLAttributes<HTMLDivElement>;

function Placeholder({ viewedLaneId, className, ...rest }: PlaceholderProps) {
  return (
    <div {...rest} className={classnames(styles.placeholder, className)}>
      <LanesIcon className={styles.icon} />
      <span className={styles.placeholderText}>{viewedLaneId}</span>
      <Icon of="fat-arrow-down" />
    </div>
  );
}

type MenuItemProps = {
  selected?: { id: string; url: string };
  current: { id: string; url: string };
} & HTMLAttributes<HTMLDivElement>;

function MenuItem(props: MenuItemProps) {
  const { selected, current } = props;

  const isCurrent = selected?.id === current.id;

  const currentVersionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  return (
    <div className={styles.menuItem} ref={currentVersionRef}>
      <MenuLinkItem active={isCurrent} href={current.url}>
        <div>{current.id}</div>
      </MenuLinkItem>
    </div>
  );
}
