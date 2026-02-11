import type { ReactNode } from 'react';
import React, { useEffect, useMemo } from 'react';
import type { RouteProps } from 'react-router-dom';
import { useQuery } from '@teambit/ui-foundation.ui.react-router.use-query';
import flatten from 'lodash.flatten';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { SlotRegistry } from '@teambit/harmony';
import { isFunction } from 'lodash';
import { ComponentProvider, ComponentDescriptorProvider } from './context';
import type { UseComponentType, Filters } from './use-component';
import { useComponent as useComponentQuery } from './use-component';
import type { ComponentModel } from './component-model';
import { useIdFromLocation } from './use-component-from-location';
import { ComponentID } from '..';

import styles from './component.module.scss';

export type ComponentPageSlot = SlotRegistry<ComponentPageElement[]>;
export type ComponentPageElement = {
  type: 'before' | 'after';
  content: ReactNode;
};

export type ComponentProps = {
  containerSlot?: ComponentPageSlot;
  routeSlot: RouteSlot;
  overriddenRoutes?: RouteProps[];
  host: string;
  onComponentChange?: (activeComponent?: ComponentModel) => void;
  useComponent?: UseComponentType;
  useComponentFilters?: () => Filters;
  path?: string;
  componentIdStr?: string | (() => string | undefined);
};

function getComponentIdStr(componentIdStr?: string | (() => string | undefined)): string | undefined {
  if (isFunction(componentIdStr)) return componentIdStr();
  return componentIdStr;
}

/**
 * main UI component of the Component extension.
 */
export function Component({
  routeSlot,
  overriddenRoutes,
  containerSlot,
  host: hostFromProps,
  onComponentChange,
  componentIdStr,
  useComponent,
  path,
  useComponentFilters,
}: ComponentProps) {
  const idFromLocation = useIdFromLocation();
  const componentIdStrWithScopeFromLocation = useIdFromLocation(undefined, true);
  const _componentIdStr = getComponentIdStr(componentIdStr);
  const componentId = _componentIdStr ? ComponentID.fromString(_componentIdStr) : undefined;
  const resolvedComponentIdStr = path || idFromLocation;
  const componentFiltersFromProps = useComponentFilters?.() || {};
  const query = useQuery();
  const componentVersion = query.get('version');
  const host = componentVersion ? 'teambit.scope/scope' : hostFromProps;

  const useComponentOptions = {
    logFilters: componentFiltersFromProps,
    skip: !!componentFiltersFromProps.loading,
    customUseComponent: useComponent,
  };

  const { component, componentDescriptor, error } = useComponentQuery(
    host,
    componentId?.toString() || componentIdStrWithScopeFromLocation,
    useComponentOptions
  );

  // trigger onComponentChange when component changes
  useEffect(() => onComponentChange?.(component), [component]);
  // cleanup when unmounting component
  useEffect(() => () => onComponentChange?.(undefined), []);

  const pageItems = useMemo(() => flatten(containerSlot?.values()), [containerSlot]);
  const before = useMemo(() => pageItems.filter((x) => x.type === 'before').map((x) => x.content), [pageItems]);
  const after = useMemo(() => pageItems.filter((x) => x.type === 'after').map((x) => x.content), [pageItems]);

  if (error?.code === 404) return error?.renderError();
  if (error) {
    return (
      <div className={styles.bootShellViewport}>
        <div className={`${styles.bootStatusRow} ${styles.bootStatusRowError}`}>
          <div className={styles.bootStatusCopy}>
            <span className={`${styles.bootStatusBadge} ${styles.bootStatusBadgeError}`}>Offline</span>
            <span className={styles.bootStatusText}>
              Component view is temporarily unavailable. Waiting for the dev server to respond.
            </span>
          </div>
          <button type="button" className={styles.bootShellAction} onClick={() => window.location.reload()}>
            Retry now
          </button>
        </div>
        <div className={styles.bootShell}>
          <h3 className={styles.bootShellTitle}>Waiting for component data</h3>
          <p className={styles.bootShellText}>
            Waiting for the dev server to respond. Your page will recover automatically.
          </p>
        </div>
      </div>
    );
  }

  if (!component) {
    return (
      <div className={styles.bootShellViewport}>
        <div className={styles.bootStatusRow}>
          <div className={styles.bootStatusCopy}>
            <span className={`${styles.bootStatusBadge} ${styles.bootStatusBadgeLoading}`}>Connecting</span>
            <span className={styles.bootStatusText}>Fetching component metadata and preview slots.</span>
          </div>
        </div>
        <div className={styles.bootShell}>
          <h3 className={styles.bootShellTitle}>Loading component</h3>
          <p className={styles.bootShellText}>Preparing component route and initial preview layout.</p>
          <div className={styles.loadingSkeleton} aria-hidden>
            <div className={styles.loadingPageHeader}>
              <div className={styles.loadingTitle} />
              <div className={styles.loadingToolbar}>
                <div className={styles.loadingChip} style={{ width: '132px' }} />
                <div className={styles.loadingChip} style={{ width: '104px' }} />
                <div className={styles.loadingChip} style={{ width: '88px' }} />
              </div>
            </div>
            <div className={styles.loadingContentGrid}>
              <div className={styles.loadingMainColumn}>
                <div className={styles.loadingHero} />
                <div className={styles.loadingTabRow}>
                  <div className={styles.loadingChip} style={{ width: '116px' }} />
                  <div className={styles.loadingChip} style={{ width: '96px' }} />
                  <div className={styles.loadingChip} style={{ width: '102px' }} />
                </div>
                <div className={styles.loadingPanelTall} />
              </div>
              <div className={styles.loadingSideColumn}>
                <div className={styles.loadingPanel} />
                <div className={styles.loadingPanelShort} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ComponentDescriptorProvider componentDescriptor={componentDescriptor}>
      <ComponentProvider component={component}>
        {before}
        <div className={styles.container}>
          {routeSlot && (
            <SlotRouter parentPath={`${resolvedComponentIdStr}/*`} slot={routeSlot} routes={overriddenRoutes} />
          )}
        </div>
        {after}
      </ComponentProvider>
    </ComponentDescriptorProvider>
  );
}
