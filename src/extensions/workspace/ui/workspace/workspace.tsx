import React, { ReactNode, useReducer } from 'react';
import { gql } from 'apollo-boost';
import { Route } from 'react-router-dom';
import 'reset-css';
import { TupleSplitPane } from '@teambit/base-ui-temp.surfaces.tuple-split-pane';
import { Layout } from '@teambit/base-ui-temp.layout.split-pane-layout';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '../../../react-router/slot-router';
import { useDataQuery } from '../../../ui/ui/data/use-data-query';
import { FullLoader } from '../../../../to-eject/full-loader';
import { WorkspaceOverview } from './workspace-overview';
import { TopBar } from '../../../../components/stage-components/top-bar';
// import { SideBar } from '../../../../components/stage-components/side-bar';
import { Corner } from '../../../../components/stage-components/corner';
import { CollapsibleSplitter } from '../../../../components/stage-components/splitter';
import { Collapser } from '../../../../components/stage-components/sidebar-collapser';
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
  sidebar: JSX.Element;
};

/**
 * main workspace component.
 */
export function Workspace({ routeSlot, menuSlot, sidebar }: WorkspaceProps) {
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
        <TopBar Corner={() => <Corner name={workspace.name} />} menu={menuSlot} />
        <TupleSplitPane max={60} min={10} ratio="264px" layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
          <div className={styles.sidebarContainer}>
            <Collapser isOpen={isSidebarOpen} onClick={handleSidebarToggle} />
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
