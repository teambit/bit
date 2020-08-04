import React, { ReactNode } from 'react';
import { gql } from 'apollo-boost';
import { Route } from 'react-router-dom';
import 'reset-css';
import { TupleSplitPane } from '@bit/bit.gui.atoms.tuple-split-pane';
import { Layout } from '@bit/bit.rendering.constants.layouts';
import { CollapsibleSplitter } from '@bit/bit.gui.atoms.split-pane.collapsible-splitter';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '../../../react-router/slot-router';
import { useDataQuery } from '../../../ui/ui/data/use-data-query';
import { FullLoader } from '../../../../to-eject/full-loader';
import { Corner } from '../../../stage-components/corner';
import { SideBar } from '../../../stage-components/side-bar';
import { TopBar } from '../../../stage-components/top-bar';
import { WorkspaceOverview } from './workspace-overview';
import styles from './workspace.module.scss';
// import { CollapsibleSplitter } from '../../../stage-components/side-bar/splitter';
// import { TopBar } from '../../../component/ui/top-bar';

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
  const { data } = useDataQuery(WORKSPACE);

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
        <TupleSplitPane max={85} min={15} layout={Layout.row} Splitter={CollapsibleSplitter}>
          <Left workspace={workspace} />
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

function Left({ workspace }: any) {
  return (
    <div className={styles.left}>
      <SideBar className={styles.sideBar} components={workspace.components} />
    </div>
  );
}
