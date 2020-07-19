import React, { ReactNode } from 'react';
import { gql } from 'apollo-boost';
import 'reset-css';
import { NavLink } from 'react-router-dom';
import { SideBar } from '../side-bar';
import styles from './workspace.module.scss';
// import { Component } from '../../../component/component.ui';
// import { defaultComponent } from './default-component';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '../../../react-router/slot-router';
import { useDataQuery } from '../../../ui/ui/data/use-data-query';
import { FullLoader } from '../../../../to-eject/full-loader';
import { WorkspaceComponentGrid } from './workspace-grid/workspace-grid';

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
          fullName
        }
        server {
          env
          url
        }
        compositions {
          filepath
          identifier
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
          <WorkspaceComponentGrid components={data.workspace.components} />
        </div>
      </div>
    </WorkspaceProvider>
  );
}

function Corner({ name }: { name: string }) {
  return (
    <NavLink to="/" className={styles.corner}>
      <span className={styles.avatar}>A</span> {name}
    </NavLink>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};
