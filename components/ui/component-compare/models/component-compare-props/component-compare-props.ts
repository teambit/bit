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
  /**
   * defer mounting this tab's content until its panel is actually visible on screen (active view
   * + scrolled near the viewport). Set on tabs whose mere mounting is expensive regardless of CSS
   * visibility — iframe-based panels (preview, docs) fetch full env preview bundles on mount, so
   * mounting one per component in a large lane compare saturates the network even when hidden.
   * Once mounted the content is never unmounted, so switching views back stays instant.
   */
  lazy?: boolean;
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
