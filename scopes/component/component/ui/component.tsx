import React, { useEffect, ReactNode, useMemo } from 'react';
import { RouteProps } from 'react-router-dom';
import flatten from 'lodash.flatten';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { SlotRegistry } from '@teambit/harmony';
import { isFunction } from 'lodash';
import { ComponentProvider, ComponentDescriptorProvider } from './context';
import { useComponent as useComponentQuery, UseComponentType, Filters } from './use-component';
import { ComponentModel } from './component-model';
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
  const host = componentId?.hasVersion() ? hostFromProps : 'teambit.scope/scope'

  const useComponentOptions = {
    logFilters: {
      ...componentFiltersFromProps,
      ...(componentFiltersFromProps.loading
        ? {}
        : {
            log: {
              // @todo - enable this when we have lazy loading of logs
              // limit: 3,
              ...componentFiltersFromProps.log,
            },
          }),
    },
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

  if (error) return error?.renderError();
  if (!component) return <div></div>;

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
