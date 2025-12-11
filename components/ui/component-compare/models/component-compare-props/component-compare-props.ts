import type { HTMLAttributes, ComponentType } from 'react';
import type { RouteProps } from 'react-router-dom';
import type { ComponentID, UseComponentType } from '@teambit/component';
import type { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import type { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import type { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import type { MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import type { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import type { StateAndHooks } from '@teambit/component.ui.component-compare.context';

export interface TabItem {
  id: string;
  order?: number;
  displayName?: string;
  props?: NavLinkProps & { displayName?: string };
  element?: React.ReactNode | null;
  widget?: boolean;
  changeType?: ChangeType;
}

export type ComponentCompareProps = {
  state?: ComponentCompareState;
  hooks?: ComponentCompareHooks;
  baseContext?: StateAndHooks;
  compareContext?: StateAndHooks;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  routes?: MaybeLazyLoaded<RouteProps[]>;
  host: string;
  baseId?: ComponentID;
  baseIdOverride?: ComponentID;
  compareIdOverride?: ComponentID;
  compareId?: ComponentID;
  customUseComponent?: UseComponentType;
  changes?: ChangeType[] | null;
  Loader?: ComponentType;
  isFullScreen?: boolean;
  hidden?: boolean;
} & HTMLAttributes<HTMLDivElement>;
