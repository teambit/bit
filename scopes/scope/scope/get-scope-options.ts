import { ComponentModel } from '@teambit/component';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { ComponentType, ReactNode } from 'react';
import { ScopeModel } from '.';

export type GetScopeOptions = {
  useScope?: () => { scope: ScopeModel | undefined };
  Corner?: ComponentType;
  paneClassName?: string;
  scopeClassName?: string;
  TargetScopeOverview?: ComponentType;
  PaneWrapper?: ComponentType<{ children: ReactNode }>;
  // drawerSlotProps?: {
  //   assumeScopeInUrl?: boolean;
  //   overrideUseComponents?: () => { components: ComponentModel[] };
  //   useLanes?: () => { lanesModel: LanesModel };
  // };
  overrideDrawers?: DrawerType[];
};
