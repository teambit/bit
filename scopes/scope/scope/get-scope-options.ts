import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { ComponentType, ReactNode } from 'react';
import { ComponentUrlResolver } from '@teambit/component.modules.component-url';
import { ScopeModel } from '.';

export type GetScopeOptions = {
  useScope?: () => { scope: ScopeModel | undefined };
  Corner?: ComponentType;
  paneClassName?: string;
  scopeClassName?: string;
  TargetScopeOverview?: ComponentType;
  PaneWrapper?: ComponentType<{ children: ReactNode }>;
  overrideDrawers?: DrawerType[];
  onSidebarToggle?: (callback: () => void) => void;
  getComponentUrl?: ComponentUrlResolver;
};
