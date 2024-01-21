import React, { createContext, useContext } from 'react';
import { ComponentCompareProps } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { DrawerProps } from '@teambit/ui-foundation.ui.tree.drawer';

export type LaneCompareDrawerContextModel = {
  compareProps: ComponentCompareProps;
  drawerProps: DrawerProps;
  isFullScreen?: boolean;
  children?: React.ReactNode;
};

const LaneCompareDrawerContext = createContext<LaneCompareDrawerContextModel>({} as LaneCompareDrawerContextModel);

export const LaneCompareDrawerProvider: React.FC<LaneCompareDrawerContextModel> = ({
  compareProps,
  drawerProps,
  isFullScreen,
  children,
}: LaneCompareDrawerContextModel) => {
  return (
    <LaneCompareDrawerContext.Provider value={{ compareProps, drawerProps, isFullScreen }}>
      {children}
    </LaneCompareDrawerContext.Provider>
  );
};

export const useLaneCompareDrawer = () => useContext(LaneCompareDrawerContext);
