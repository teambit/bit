import React, { useReducer } from 'react';
import { Route } from 'react-router-dom';
import { TupleSplitPane } from '@teambit/base-ui-temp.surfaces.tuple-split-pane';
import { Layout } from '@teambit/base-ui-temp.layout.split-pane-layout';
import { RouteSlot, SlotRouter } from '@teambit/react-router';
import { Corner } from '@teambit/staged-components.corner';
import { TopBar } from '@teambit/staged-components.top-bar';
import { CollapsibleSplitter } from '@teambit/staged-components.splitter';
import { Collapser } from '@teambit/staged-components.side-bar';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import { ScopeOverview } from './scope-overview';
import { ScopeProvider } from './scope-provider';
import { useScope } from './use-scope';

import styles from './scope.module.scss';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
};

/**
 * root component of the scope
 */
export function Scope({ routeSlot, menuSlot, sidebar }: ScopeProps) {
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
        <TopBar Corner={() => <Corner name={scope.name} />} menu={menuSlot} />
        <TupleSplitPane ratio="264px" max={60} min={10} layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
          <div className={styles.sidebarContainer}>
            <Collapser
              id="scopeSidebarCollapser"
              isOpen={isSidebarOpen}
              tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
              onClick={handleSidebarToggle}
            />
            <div className={styles.sidebar}>{sidebar}</div>
          </div>
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
