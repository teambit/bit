import 'reset-css';

import { Layout } from '@teambit/base-ui.surfaces.split-pane.layout';
import { TupleSplitPane } from '@teambit/base-ui.surfaces.split-pane.tuple-split-pane';
import { RouteSlot, SlotRouter } from '@teambit/react-router';
import { Corner } from '@teambit/staged-components.corner';
import { Collapser } from '@teambit/staged-components.side-bar';
import { CollapsibleSplitter } from '@teambit/staged-components.splitter';
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
        <TopBar Corner={() => <Corner name={workspace.name} />} menu={menuSlot} />
        <TupleSplitPane max={60} min={10} ratio="264px" layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
          <div className={styles.sidebarContainer}>
            <Collapser
              id="workspaceSidebarCollapser"
              isOpen={isSidebarOpen}
              onClick={handleSidebarToggle}
              tooltipContent={`${isSidebarOpen ? 'Hide' : 'Show'} side panel`}
            />
            <div className={styles.sidebar}>{sidebar}</div>
          </div>
          <div className={styles.main}>
            <SlotRouter slot={routeSlot} />
            <Route exact path="/">
              <WorkspaceOverview />
            </Route>
          </div>
        </TupleSplitPane>
      </div>
    </WorkspaceProvider>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};
