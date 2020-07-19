import React from 'react';
import { useRouteMatch } from 'react-router-dom';
import { ComponentProvider } from './context';
import { TopBar } from './top-bar';
import styles from './component.module.scss';
import { NavigationSlot, RouteSlot, SlotSubRouter } from '../../react-router/slot-router';
import { FullLoader } from '../../../to-eject/full-loader';
import { useComponentQuery } from './use-component-query';

export type ComponentProps = {
  navSlot: NavigationSlot;
  routeSlot: RouteSlot;
  widgetSlot: NavigationSlot;
  host: string;
};

/**
 * main UI component of the Component extension.
 */
export function Component({ navSlot, routeSlot, widgetSlot, host }: ComponentProps) {
  const {
    params: { componentId },
  } = useRouteMatch();

  const component = useComponentQuery(componentId, host);
  if (!component) return <FullLoader />;

  return (
    <ComponentProvider component={component}>
      <div className={styles.container}>
        <TopBar
          className={styles.topbar}
          navigationSlot={navSlot}
          version={component.id.version || 'new'}
          widgetSlot={widgetSlot}
        />
        {routeSlot && <SlotSubRouter slot={routeSlot} />}
      </div>
    </ComponentProvider>
  );
}
