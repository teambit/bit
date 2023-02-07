import React, { HTMLAttributes } from 'react';
import AnimateHeight from 'react-animate-height';
import { ComponentCompareProps } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { DrawerProps, DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { ComponentCompare } from '@teambit/component.ui.component-compare.component-compare';
import { computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';

import styles from './lane-compare-drawer-name.module.scss';

export type LaneCompareDrawerProps = {
  compareProps: ComponentCompareProps;
  drawerProps: DrawerProps;
  isFullScreen?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompareDrawer({ drawerProps, compareProps, isFullScreen }: LaneCompareDrawerProps) {
  const open = drawerProps.isOpen;
  const { baseId, compareId } = compareProps;
  const key = computeStateKey(baseId, compareId);

  return (
    <DrawerUI {...drawerProps}>
      <AnimateHeight
        height={open ? (isFullScreen && '100%') || 'auto' : 0}
        className={(isFullScreen && styles.fullScreenDrawer) || undefined}
      >
        {(!!open && <ComponentCompare key={`lane-compare-component-compare-${key}`} {...compareProps} />) || <></>}
      </AnimateHeight>
    </DrawerUI>
  );
}
