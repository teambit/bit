import React, { useEffect, ReactNode, useMemo } from 'react';
import flatten from 'lodash.flatten';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { SlotRegistry } from '@teambit/harmony';
import { isFunction } from 'lodash';
import styles from './component.module.scss';
import { ComponentProvider, ComponentDescriptorProvider } from './context';
import { useComponent as useComponentQuery, UseComponentType } from './use-component';
import { ComponentModel } from './component-model';
import { useIdFromLocation } from './use-component-from-location';
import { ComponentID } from '..';
import { Filters } from './use-component-query';

export type ComponentPageSlot = SlotRegistry<ComponentPageElement[]>;
export type ComponentPageElement = {
  type: 'before' | 'after';
  content: ReactNode;
};

export type ComponentProps = {
  containerSlot?: ComponentPageSlot;
  routeSlot: RouteSlot;
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
  containerSlot,
  host,
  onComponentChange,
  componentIdStr,
  useComponent,
  path,
  useComponentFilters,
}: ComponentProps) {
  const idFromLocation = useIdFromLocation();
  const _componentIdStr = getComponentIdStr(componentIdStr);
  const componentId = _componentIdStr ? ComponentID.fromString(_componentIdStr) : undefined;
  const resolvedComponentIdStr = path || idFromLocation;
  const useComponentOptions = {
    logFilters: useComponentFilters?.(),
    customUseComponent: useComponent,
  };

  const { component, componentDescriptor, error } = useComponentQuery(
    host,
    componentId?.toString() || idFromLocation,
    useComponentOptions
  );
  // trigger onComponentChange when component changes
  useEffect(() => onComponentChange?.(component), [component]);
  // cleanup when unmounting component
  useEffect(() => () => onComponentChange?.(undefined), []);

  const pageItems = useMemo(() => flatten(containerSlot?.values()), [containerSlot]);
  const before = useMemo(() => pageItems.filter((x) => x.type === 'before').map((x) => x.content), [pageItems]);
  const after = useMemo(() => pageItems.filter((x) => x.type === 'after').map((x) => x.content), [pageItems]);

  if (error) return error.renderError();
  if (!component) return <div></div>;

  return (
    <ComponentDescriptorProvider componentDescriptor={componentDescriptor}>
      <ComponentProvider component={component}>
        {before}
        <div className={styles.container}>
          {routeSlot && <SlotRouter parentPath={`${resolvedComponentIdStr}/*`} slot={routeSlot} />}
        </div>
        {after}
      </ComponentProvider>
    </ComponentDescriptorProvider>
  );
}
