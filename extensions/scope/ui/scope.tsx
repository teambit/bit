import { Layout } from '@teambit/base-ui.surfaces.split-pane.layout';
import { Pane } from '@teambit/base-ui.surfaces.split-pane.pane';
import { SplitPane } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { RouteSlot, SlotRouter } from '@teambit/react-router';
import { Corner } from '@teambit/staged-components.corner';
import { Collapser } from '@teambit/staged-components.side-bar';
import { CollapsibleSplitter } from '@teambit/staged-components.splitter';
import { TopBar } from '@teambit/staged-components.top-bar';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import React, { useReducer } from 'react';
import { Route } from 'react-router-dom';

import { ScopeOverview } from './scope-overview';
import { ScopeProvider } from './scope-provider';
import styles from './scope.module.scss';
import { useScope } from './use-scope';

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

  return (
    <ScopeProvider scope={scope}>
      <div className={styles.scope}>
        <TopBar className={styles.topbar} Corner={() => <Corner name={scope.name} />} menu={menuSlot} />

        <SplitPane className={styles.main} size={264} layout={sidebarOpenness}>
          <Pane className={styles.sidebar}>{sidebar}</Pane>
          <CollapsibleSplitter className={styles.splitter}>
            <Collapser
              id="scopeSidebarCollapser"
              isOpen={isSidebarOpen}
              onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
              onClick={handleSidebarToggle}
              tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
            />
          </CollapsibleSplitter>
          <Pane>
            <SlotRouter slot={routeSlot} />
            <Route exact path="/">
              <ScopeOverview />
            </Route>
          </Pane>
        </SplitPane>
      </div>
    </ScopeProvider>
  );
}
