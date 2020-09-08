import { RouteSlot, SlotSubRouter } from '@teambit/react-router';
import React from 'react';

import styles from './component.module.scss';
import { ComponentProvider } from './context';
import { useComponent } from './use-component';

export type ComponentProps = {
  routeSlot: RouteSlot;
  host: string;
};

/**
 * main UI component of the Component extension.
 */
export function Component({ routeSlot, host }: ComponentProps) {
  const { component, error } = useComponent(host);
  if (error) return error.renderError();
  if (!component) return <div></div>;

  return (
    <ComponentProvider component={component}>
      <div className={styles.container}>{routeSlot && <SlotSubRouter slot={routeSlot} />}</div>
    </ComponentProvider>
  );
}
