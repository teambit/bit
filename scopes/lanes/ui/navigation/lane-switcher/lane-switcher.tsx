import React, { HTMLAttributes, useRef, useEffect } from 'react';
import classnames from 'classnames';
import { Dropdown } from '@teambit/design.inputs.dropdown';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { DEFAULT_LANE } from '@teambit/lanes.ui.models.lanes-model';
import { LaneIcon } from '@teambit/lanes.ui.icons.lane-icon';
import { Icon } from '@teambit/evangelist.elements.icon';
import { LaneId } from '@teambit/lane-id';

import styles from './lane-switcher.module.scss';

export type LaneSwitcherProps = {} & HTMLAttributes<HTMLDivElement>;

export function LaneSwitcher({ className, ...rest }: LaneSwitcherProps) {
  const { lanesModel, updateLanesModel } = useLanes();
  // const [redirectUrl, setRedirectUrl] = useState<string | undefined>(undefined);

  const availableLanes: Array<LaneId | typeof DEFAULT_LANE> = [
    DEFAULT_LANE,
    ...(lanesModel?.lanes || []).map((lane) => lane.id),
  ];

  const viewedLaneId = lanesModel?.viewedLane?.id;
  const selectedLaneId = viewedLaneId || DEFAULT_LANE;

  // useEffect(() => {
  //   if (!lanesModel?.viewedLane && lanesModel?.currentLane) {
  //     // redirect
  //     setRedirectUrl(LanesModel.getLaneUrl(lanesModel.currentLane.id));
  //   }
  //   // clean up the redirect url after this is done
  //   return () => {
  //     setRedirectUrl(undefined);
  //   };
  // }, [lanesModel?.currentLane?.id.toString()]);

  // if (!viewedLaneId && redirectUrl) {
  //   return <Navigate to={redirectUrl} replace />;
  // }

  const onLaneSelected = (laneId) => () => {
    lanesModel?.setViewedLane(laneId);
    updateLanesModel?.(lanesModel);
  };

  return (
    <Dropdown
      {...rest}
      // @ts-ignore - mismatch between @types/react
      placeholder={<Placeholder selectedLaneId={selectedLaneId.toString()} />}
      className={classnames(className, styles.dropdown)}
    >
      {availableLanes.map((lane) => (
        <MenuItem
          onLaneSelected={onLaneSelected(lane)}
          key={lane.toString()}
          selected={selectedLaneId}
          current={lane}
        ></MenuItem>
      ))}
    </Dropdown>
  );
}

type PlaceholderProps = { selectedLaneId: string } & React.HTMLAttributes<HTMLDivElement>;

function Placeholder({ selectedLaneId, className, ...rest }: PlaceholderProps) {
  return (
    <div {...rest} className={classnames(styles.placeholder, className)}>
      <LaneIcon className={styles.icon} />
      <span className={styles.placeholderText}>{selectedLaneId}</span>
      <Icon of="fat-arrow-down" />
    </div>
  );
}

type MenuItemProps = {
  selected?: LaneId | typeof DEFAULT_LANE;
  current: LaneId | typeof DEFAULT_LANE;
  onLaneSelected?: () => void;
} & HTMLAttributes<HTMLDivElement>;

function MenuItem(props: MenuItemProps) {
  const { selected, current } = props;
  const isCurrent = selected?.toString() === current.toString();

  const currentVersionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  return (
    <div className={styles.menuItem} ref={currentVersionRef}>
      <div className={classnames(isCurrent && styles.current)} onClick={props.onLaneSelected}>
        <div>{current.toString()}</div>
      </div>
    </div>
  );
}
