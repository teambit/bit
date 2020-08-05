import React from 'react';
import { Route } from 'react-router-dom';
import { RouteSlot, SlotRouter } from '../../react-router/slot-router';
import { ScopeOverview } from './scope-overview';
import { FullLoader } from '../../../to-eject/full-loader';
import { ScopeProvider } from './scope-provider';
import styles from './scope.module.scss';
import { Corner } from '../../../components/stage-components/corner';
import { SideBar } from '../../../components/stage-components/side-bar';
import { useScope } from './use-scope';
import { TopBar } from '../../../components/stage-components/top-bar';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
};

/**
 * root component of the scope
 */
export function Scope({ routeSlot, menuSlot }: ScopeProps) {
  const { scope } = useScope();

  if (!scope) {
    return <FullLoader />;
  }

  const ids = scope.components.map((component) => component);

  return (
    <ScopeProvider scope={scope}>
      <div className={styles.scope}>
        <TopBar Corner={() => <Corner name={scope.name} />} menu={menuSlot} />
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
