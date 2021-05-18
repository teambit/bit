import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import React, { useEffect } from 'react';

import styles from './component.module.scss';
import { ComponentProvider } from './context';
import { useComponent } from './use-component';
import { ComponentModel } from './component-model';

export type ComponentProps = {
  routeSlot: RouteSlot;
  host: string;
  onComponentChange?: (activeComponent?: ComponentModel) => void;
};

/**
 * main UI component of the Component extension.
 */
export function Component({ routeSlot, host, onComponentChange }: ComponentProps) {
  const { component, error } = useComponent(host);
  // cleanup when unmounting component
  useEffect(() => {
    return () => onComponentChange?.(undefined);
  }, []);
  useEffect(() => onComponentChange?.(component), [component]);
  if (error) return error.renderError();
  if (!component) return <div></div>;

  return (
    <ComponentProvider component={component}>
      <div className={styles.container}>{routeSlot && <SlotSubRouter slot={routeSlot} />}</div>
    </ComponentProvider>
  );
}
