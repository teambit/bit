import React from 'react';
import { ComponentProvider } from './context';
import styles from './component.module.scss';
import { RouteSlot, SlotSubRouter } from '../../react-router/slot-router';
import { useComponent } from './use-component';

export type ComponentProps = {
  routeSlot: RouteSlot;
  host: string;
};

/**
 * main UI component of the Component extension.
 */
export function Component({ routeSlot, host }: ComponentProps) {
  const component = useComponent(host);
  if (!component) return <div />;

  return (
    <ComponentProvider component={component}>
      <div className={styles.container}>{routeSlot && <SlotSubRouter slot={routeSlot} />}</div>
    </ComponentProvider>
  );
}
