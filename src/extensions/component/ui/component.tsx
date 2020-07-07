import React from 'react';
import { gql } from 'apollo-boost';
import { useRouteMatch } from 'react-router-dom';
import { ComponentProvider } from './context';
import { TopBar } from './top-bar';
import styles from './component.module.scss';
import { ComponentModel } from './component-model';
import { NavigationSlot, RouteSlot, SlotSubRouter } from '../../react-router/slot-router';
import { useDataQuery } from '../../ui/ui/data/use-data-query';
import { FullLoader } from '../../../to-eject/full-loader';

const GET_COMPONENT = gql`
  query Component($id: String!) {
    workspace {
      getComponent(id: $id) {
        id
        displayName
        version
        server {
          env
          url
        }
        compositions {
          identifier
        }
      }
    }
  }
`;

export type ComponentProps = {
  navSlot: NavigationSlot;
  routeSlot: RouteSlot;
  widgetSlot: NavigationSlot;
};

/**
 * main UI component of the Component extension.
 */
export function Component({ navSlot, routeSlot, widgetSlot }: ComponentProps) {
  const {
    params: { componentId }
  } = useRouteMatch();

  const { data } = useDataQuery(GET_COMPONENT, {
    variables: { id: componentId }
  });

  if (!data) return <FullLoader />;

  const component = ComponentModel.from(data.workspace.getComponent);

  return (
    <ComponentProvider component={component}>
      <div className={styles.container}>
        <TopBar
          className={styles.topbar}
          navigationSlot={navSlot}
          version={component.version}
          widgetSlot={widgetSlot}
        />
        {routeSlot && <SlotSubRouter slot={routeSlot} />}
      </div>
    </ComponentProvider>
  );
}
