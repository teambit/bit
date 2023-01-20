import React, { HTMLAttributes } from 'react';
import AnimateHeight from 'react-animate-height';
import { ComponentCompareProps } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { DrawerProps, DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { ComponentCompare } from '@teambit/component.ui.component-compare.component-compare';
import { computeStateKey } from '@teambit/lanes.ui.compare.lane-compare-state';

export type LaneCompareDrawerProps = {
  compareProps: ComponentCompareProps;
  drawerProps: DrawerProps;
} & HTMLAttributes<HTMLDivElement>;

export function LaneCompareDrawer({ drawerProps, compareProps }: LaneCompareDrawerProps) {
  const open = drawerProps.isOpen;
  const { baseId, compareId } = compareProps;
  const key = computeStateKey(baseId, compareId);

  return (
    <DrawerUI {...drawerProps}>
      <AnimateHeight height={open ? 'auto' : 0}>
        {(!!open && <ComponentCompare key={`lane-compare-component-compare-${key}`} {...compareProps} />) || <></>}
      </AnimateHeight>
    </DrawerUI>
  );
}
