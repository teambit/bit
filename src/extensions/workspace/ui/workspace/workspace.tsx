import React, { ReactNode } from 'react';
import { gql } from 'apollo-boost';
import { Route } from 'react-router-dom';
import 'reset-css';
import styles from './workspace.module.scss';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '../../../react-router/slot-router';
import { useDataQuery } from '../../../ui/ui/data/use-data-query';
import { FullLoader } from '../../../../to-eject/full-loader';
import { Corner } from '../../../stage-components/corner';
import { SideBar } from '../../../stage-components/side-bar';
import { WorkspaceOverview } from './workspace-overview';

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
};

/**
 * main workspace component.
 */
export function Workspace({ routeSlot }: WorkspaceProps) {
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
      <div className={styles.workspace}>
        <Corner name={workspace.name} />
        <SideBar className={styles.sideBar} components={workspace.components} />
        <div className={styles.main}>
          <SlotRouter slot={routeSlot} />
          {/* TODO - @oded move to route slot once we can register more than one slot at a time */}
          <Route exact path="/">
            <WorkspaceOverview />
          </Route>
        </div>
      </div>
    </WorkspaceProvider>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};
