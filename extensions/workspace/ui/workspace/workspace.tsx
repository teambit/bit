import React, { ReactNode, useReducer } from 'react';
import { gql } from 'apollo-boost';
import { Route } from 'react-router-dom';
import 'reset-css';
import { TupleSplitPane } from '@teambit/base-ui-temp.surfaces.tuple-split-pane';
import { Layout } from '@teambit/base-ui-temp.layout.split-pane-layout';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '@teambit/react-router/slot-router';
import { useDataQuery } from '@teambit/ui/ui/data/use-data-query';
import { FullLoader } from 'bit-bin/dist/to-eject/full-loader';
import { WorkspaceOverview } from './workspace-overview';
import { TopBar } from '@teambit/staged-components.top-bar';
import { SideBar } from '@teambit/staged-components.side-bar';
import { Corner } from '@teambit/staged-components.corner';
import { CollapsibleSplitter } from '@teambit/staged-components.splitter';
import styles from './workspace.module.scss';

const WORKSPACE = gql`
  {
    workspace {
      name
      path
      components {
        id {
          name
          version
          scope
        }
        status {
          isNew
          isInScope
          isStaged
          modifyInfo {
            hasModifiedFiles
            hasModifiedDependencies
          }
          isDeleted
        }
        deprecation {
          isDeprecate
        }
        server {
          env
          url
        }
        env {
          id
          icon
        }
      }
    }
  }
`;

export type WorkspaceProps = {
  routeSlot: RouteSlot;
  menuSlot: RouteSlot;
};

/**
 * main workspace component.
 */
export function Workspace({ routeSlot, menuSlot }: WorkspaceProps) {
  const { data } = useDataQuery(WORKSPACE);

  const [isSidebarOpen, handleSidebarToggle] = useReducer((x) => !x, true);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;

  if (!data) {
    return (
      <div className={styles.emptyContainer}>
        <FullLoader />
      </div>
    );
  }

  const workspace = WorkspaceModel.from(data.workspace);

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className={styles.workspaceWrapper}>
        <TopBar Corner={() => <Corner name={workspace.name} onClick={handleSidebarToggle} />} menu={menuSlot} />
        <TupleSplitPane max={60} min={10} ratio="264px" layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
          <SideBar components={workspace.components} />
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
