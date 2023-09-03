import React, { HTMLAttributes } from 'react';
import { ComponentCompareProps } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { DrawerProps, DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { ComponentCompare } from '@teambit/component.ui.component-compare.component-compare';
import { computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';
import classnames from 'classnames';

import styles from './lane-compare-drawer-name.module.scss';

export type LaneCompareDrawerProps = {
  compareProps: ComponentCompareProps;
  drawerProps: DrawerProps;
  isFullScreen?: boolean;
  lastInteracted?: boolean;
  onInteract?: (e: React.MouseEvent<HTMLDivElement>) => void;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompareDrawer({ drawerProps, compareProps, isFullScreen }: LaneCompareDrawerProps) {
  const open = drawerProps.isOpen;
  const { baseId, compareId } = compareProps;
  const key = computeStateKey(baseId, compareId);

  const fullScreenStyles = isFullScreen ? styles.fullScreenDrawer : undefined;
  const heightStyles = open ? (isFullScreen && styles.fullHeight) || styles.autoHeight : styles.noHeight || undefined;

  return (
    <div className={classnames(styles.drawerRoot)} key={key}>
      <DrawerUI key={`${key}-lane-drawer`} {...drawerProps}>
        <ComponentCompare
          hidden={!open}
          className={classnames(!open && styles.closed, fullScreenStyles, heightStyles)}
          key={`lane-compare-component-compare-${key}`}
          {...compareProps}
        />
      </DrawerUI>
    </div>
  );
}
