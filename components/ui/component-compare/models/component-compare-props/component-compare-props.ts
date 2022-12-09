import { HTMLAttributes } from 'react';
import { RouteProps } from 'react-router-dom';
import { ComponentID } from '@teambit/component-id';
import { ComponentCompareHooks } from '@teambit/component.ui.component-compare.models.component-compare-hooks';
import { ComponentCompareState } from '@teambit/component.ui.component-compare.models.component-compare-state';
import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { MaybeLazyLoaded } from '@teambit/component.ui.component-compare.utils.lazy-loading';
import { UseComponentType } from '@teambit/component';

export type TabItem = {
  id?: string;
  order?: number;
  displayName?: string;
  props?: NavLinkProps & { displayName?: string };
  element?: React.ReactNode | null;
  widget?: boolean;
};

export type ComponentCompareProps = {
  state?: ComponentCompareState;
  hooks?: ComponentCompareHooks;
  tabs?: MaybeLazyLoaded<TabItem[]>;
  routes?: MaybeLazyLoaded<RouteProps[]>;
  host: string;
  baseId?: ComponentID;
  compareId?: ComponentID;
  customUseComponent?: UseComponentType;
} & HTMLAttributes<HTMLDivElement>;
