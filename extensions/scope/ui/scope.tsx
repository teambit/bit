import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { RouteSlot, SlotRouter } from '@teambit/react-router';
import { Corner } from '@teambit/staged-components.corner';
import { Collapser } from '@teambit/staged-components.side-bar';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/staged-components.top-bar';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import React, { useReducer } from 'react';
import { Route } from 'react-router-dom';

import { ScopeOverview } from './scope-overview';
import { ScopeProvider } from './scope-provider';
import styles from './scope.module.scss';
import { useScope } from './use-scope';
import ScopeUI from '../scope.ui.runtime';

export type ScopeProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
  scopeUi: ScopeUI;
};

/**
 * root component of the scope
 */
export function Scope({ routeSlot, menuSlot, sidebar, scopeUi }: ScopeProps) {
  const { scope } = useScope();
  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;

  if (!scope) {
    return <FullLoader />;
  }

  scopeUi.setComponents(scope.components);

  return (
    <ScopeProvider scope={scope}>
      <div className={styles.scope}>
        <TopBar className={styles.topbar} Corner={() => <Corner name={scope.name} />} menu={menuSlot} />

        <SplitPane className={styles.main} size={264} layout={sidebarOpenness}>
          <Pane className={styles.sidebar}>{sidebar}</Pane>
          <HoverSplitter className={styles.splitter}>
            <Collapser
              id="scopeSidebarCollapser"
              isOpen={isSidebarOpen}
              onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
              onClick={handleSidebarToggle}
              tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
            />
          </HoverSplitter>
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
