import React, { useReducer } from 'react';
import { Route } from 'react-router-dom';
import { TupleSplitPane } from '@teambit/base-ui-temp.surfaces.tuple-split-pane';
import { Layout } from '@teambit/base-ui-temp.layout.split-pane-layout';
import { RouteSlot, SlotRouter } from '../../react-router';
import { ScopeOverview } from './scope-overview';
import { FullLoader } from '../../../to-eject/full-loader';
import { ScopeProvider } from './scope-provider';
import { Corner } from '../../../components/stage-components/corner';
import { SideBar } from '../../../components/stage-components/side-bar';
import { useScope } from './use-scope';
import { TopBar } from '../../../components/stage-components/top-bar';
import { CollapsibleSplitter } from '../../../components/stage-components/splitter';
import styles from './scope.module.scss';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
};

/**
 * root component of the scope
 */
export function Scope({ routeSlot, menuSlot }: ScopeProps) {
  const { scope } = useScope();
  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;

  if (!scope) {
    return <FullLoader />;
  }

  const ids = scope.components.map((component) => component);
  return (
    <ScopeProvider scope={scope}>
      <div className={styles.scope}>
        <TopBar Corner={() => <Corner name={scope.name} onClick={handleSidebarToggle} />} menu={menuSlot} />
        <TupleSplitPane ratio="264px" max={60} min={10} layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
          <SideBar components={ids} className={styles.sideBar} />
          <div className={styles.main}>
            <SlotRouter slot={routeSlot} />
            <Route exact path="/">
              <ScopeOverview />
            </Route>
          </div>
        </TupleSplitPane>
      </div>
    </ScopeProvider>
  );
}
