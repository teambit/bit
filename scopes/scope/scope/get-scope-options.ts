import { DrawerType } from '@teambit/ui-foundation.ui.tree.drawer';
import { ComponentType, ReactNode } from 'react';
import { ComponentUrlResolver } from '@teambit/component.modules.component-url';
import type { ScopeModel } from '@teambit/scope.models.scope-model';

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
