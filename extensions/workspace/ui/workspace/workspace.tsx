import 'reset-css';

import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { RouteSlot, SlotRouter } from '@teambit/react-router';
import { Corner } from '@teambit/staged-components.corner';
import { Collapser } from '@teambit/staged-components.side-bar';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/staged-components.top-bar';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import React, { ReactNode, useReducer } from 'react';
import { Route } from 'react-router-dom';

import { useWorkspace } from './use-workspace';
import { WorkspaceOverview } from './workspace-overview';
import { WorkspaceProvider } from './workspace-provider';
import styles from './workspace.module.scss';

export type WorkspaceProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
};

/**
 * main workspace component.
 */
export function Workspace({ routeSlot, menuSlot, sidebar }: WorkspaceProps) {
  const workspace = useWorkspace();

  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;

  if (!workspace) {
    return (
      <div className={styles.emptyContainer}>
        <FullLoader />
      </div>
    );
  }

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className={styles.workspaceWrapper}>
        <TopBar className={styles.topbar} Corner={() => <Corner name={workspace.name} />} menu={menuSlot} />

        <SplitPane className={styles.main} size={264} layout={sidebarOpenness}>
          <Pane className={styles.sidebar}>{sidebar}</Pane>
          <HoverSplitter className={styles.splitter}>
            <Collapser
              id="workspaceSidebarCollapser"
              isOpen={isSidebarOpen}
              onMouseDown={(e) => e.stopPropagation()} // avoid split-pane drag
              onClick={handleSidebarToggle}
              tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
            />
          </HoverSplitter>
          <Pane>
            <SlotRouter slot={routeSlot} />
            <Route exact path="/">
              <WorkspaceOverview />
            </Route>
          </Pane>
        </SplitPane>
      </div>
    </WorkspaceProvider>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};
