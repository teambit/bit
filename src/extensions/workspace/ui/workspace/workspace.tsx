import React, { ReactNode, useState } from 'react';
import { gql } from 'apollo-boost';
import { Route } from 'react-router-dom';
import 'reset-css';
import { TupleSplitPane } from '@bit/bit.gui.atoms.tuple-split-pane';
import { Layout } from '@bit/bit.rendering.constants.layouts';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '../../../react-router/slot-router';
import { useDataQuery } from '../../../ui/ui/data/use-data-query';
import { FullLoader } from '../../../../to-eject/full-loader';
import { WorkspaceOverview } from './workspace-overview';
import { TopBar } from '../../../../components/stage-components/top-bar';
import { SideBar } from '../../../../components/stage-components/side-bar';
import { Corner } from '../../../../components/stage-components/corner';
import { CollapsibleSplitter } from '../../../../components/stage-components/splitter';
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
          isModified
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
  // TODO - @oded find a way to reuse the sidebar collapse functionality between scope and workspace
  const [isSidebarOpen, toggleOpenness] = useState(true);
  const { data } = useDataQuery(WORKSPACE);

  if (!data) {
    return (
      <div className={styles.emptyContainer}>
        <FullLoader />
      </div>
    );
  }

  const handleOpenness = () => {
    toggleOpenness(!isSidebarOpen);
  };

  const workspace = WorkspaceModel.from(data.workspace);
  const sidebarOpenness = isSidebarOpen ? Layout.row : Layout.right;
  return (
    <WorkspaceProvider workspace={workspace}>
      <div className={styles.workspaceWrapper}>
        <TopBar Corner={() => <Corner name={workspace.name} onClick={handleOpenness} />} menu={menuSlot} />
        <TupleSplitPane max={60} min={10} layout={sidebarOpenness} Splitter={CollapsibleSplitter}>
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
