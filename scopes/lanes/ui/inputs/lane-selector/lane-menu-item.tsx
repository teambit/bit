import React, { HTMLAttributes, useRef, useEffect } from 'react';
import classnames from 'classnames';
import { LaneId } from '@teambit/lane-id';
import { useNavigate } from 'react-router-dom';
import { classes } from '@teambit/design.ui.surfaces.menu.item';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { PillLabel } from '@teambit/design.ui.pill-label';

import styles from './lane-menu-item.module.scss';

export type LaneMenuItemProps = {
  selected?: LaneId;
  current: LaneId;
  onLaneSelected?: () => void;
} & HTMLAttributes<HTMLDivElement>;

export function LaneMenuItem({ selected, current, onLaneSelected, className, ...rest }: LaneMenuItemProps) {
  const isCurrent = selected?.toString() === current.toString();

  const currentVersionRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isCurrent) {
      currentVersionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [isCurrent]);

  const navigate = useNavigate();

  const onLaneClicked = () => {
    onLaneSelected?.();
    navigate(LanesModel.getLaneUrl(current));
  };

  return (
    <div
      {...rest}
      className={classnames(styles.menuItem, className, isCurrent && classes.active)}
      ref={currentVersionRef}
      onClick={onLaneClicked}
    >
      <div className={styles.laneName}>{current.name}</div>
      {current.isDefault() && (
        <PillLabel className={styles.defaultLanePill}>
          <span>default</span>
        </PillLabel>
      )}
    </div>
  );
}
