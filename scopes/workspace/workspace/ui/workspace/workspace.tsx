import 'reset-css';

import { SplitPane, Pane, Layout } from '@teambit/base-ui.surfaces.split-pane.split-pane';
import { RouteSlot, SlotRouter } from '@teambit/ui.react-router.slot-router';
import { Corner } from '@teambit/ui.corner';
import { Collapser } from '@teambit/ui.side-bar';
import { HoverSplitter } from '@teambit/base-ui.surfaces.split-pane.hover-splitter';
import { TopBar } from '@teambit/ui.top-bar';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import React, { ReactNode, useReducer } from 'react';
import { Route } from 'react-router-dom';

import { useWorkspace } from './use-workspace';
import { WorkspaceOverview } from './workspace-overview';
import { WorkspaceProvider } from './workspace-provider';
import styles from './workspace.module.scss';
import WorkspaceUI from '../../workspace.ui.runtime';

export type WorkspaceProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
  sidebar: JSX.Element;
  workspaceUI: WorkspaceUI;
  onSidebarTogglerChange: (callback: () => void) => void;
};

/**
 * main workspace component.
 */
export function Workspace({ routeSlot, menuSlot, sidebar, workspaceUI, onSidebarTogglerChange }: WorkspaceProps) {
  const workspace = useWorkspace();

  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;

  onSidebarTogglerChange(handleSidebarToggle);

  if (!workspace) {
    return (
      <div className={styles.emptyContainer}>
        <FullLoader />
      </div>
    );
  }

  workspaceUI.setComponents(workspace.components);

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className={styles.workspaceWrapper}>
        <TopBar
          className={styles.topbar}
          Corner={() => <Corner name={workspace.name} icon={workspace.icon} />}
          menu={menuSlot}
        />

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
