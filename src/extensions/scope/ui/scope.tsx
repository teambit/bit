import React from 'react';
import gql from 'graphql-tag';
import { Route } from 'react-router-dom';
import { RouteSlot, SlotRouter } from '../../react-router/slot-router';
import { ScopeOverview } from './scope-overview';
import { FullLoader } from '../../../to-eject/full-loader';
import { ScopeModel } from './scope-model';
import { useDataQuery } from '../../ui/ui/data/use-data-query';
import { Corner } from '../../stage-components/corner';
import { ScopeProvider } from './scope-provider';
import { SideBar } from '../../stage-components/side-bar';
import styles from './scope.module.scss';

export type ScopeProps = {
  routeSlot: RouteSlot;
};

// TODO: add env to scope
const SCOPE = gql`
  {
    scope {
      name
      components {
        id {
          name
          version
          scope
        }
      }
    }
  }
`;

/**
 * root component of the scope
 */
export function Scope({ routeSlot }: ScopeProps) {
  const { data, loading } = useDataQuery(SCOPE);

  if (loading) {
    return <FullLoader />;
  }

  const scope = ScopeModel.from(data);
  const ids = scope.components.map((component) => component);

  return (
    <ScopeProvider scope={scope}>
      <div className={styles.scope}>
        <Corner name={scope.name} />
        <SideBar components={ids} className={styles.sideBar} />
        <div className={styles.main}>
          <SlotRouter slot={routeSlot} />
          {/* TODO - @oded move to route slot once we can register more than one slot at a time */}
          {/* TODO - scope still uses ComponentMeta so we dont get all the data here */}
          <Route exact path="/">
            <ScopeOverview />
          </Route>
        </div>
      </div>
    </ScopeProvider>
  );
}
