import React, { useEffect, ReactNode, useMemo } from 'react';
import flatten from 'lodash.flatten';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { SlotRegistry } from '@teambit/harmony';
import { useLanesContext } from '@teambit/lanes.ui.lanes';
import styles from './component.module.scss';
import { ComponentProvider, ComponentDescriptorProvider } from './context';
import { useComponent as useComponentQuery, UseComponentType } from './use-component';
import { ComponentModel } from './component-model';
import { useIdFromLocation } from './use-component-from-location';
import { ComponentID } from '..';

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
  componentIdStr?: string;
};

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
}: ComponentProps) {
  const idFromLocation = useIdFromLocation();
  const componentId = componentIdStr ? ComponentID.fromString(componentIdStr) : undefined;
  const fullName = componentId?.fullName && idFromLocation;
  const lanesContext = useLanesContext();
  const laneComponent = fullName
    ? lanesContext?.resolveComponent(fullName)
    : undefined;
  const useComponentOptions = {
    logFilters: laneComponent && { log: { logHead: laneComponent.version } },
    customUseComponent: useComponent,
  };

  const { component, componentDescriptor, error } = useComponentQuery(
    host,
    laneComponent?.id.toString() || componentId?.toString() || idFromLocation,
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
          {routeSlot && <SlotRouter parentPath={`${fullName}/*`} slot={routeSlot} />}
        </div>
        {after}
      </ComponentProvider>
    </ComponentDescriptorProvider>
  );
}
