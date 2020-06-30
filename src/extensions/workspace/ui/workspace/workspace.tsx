import React, { useState, ReactNode } from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';
import 'reset-css';
import { SideBar } from '../side-bar';
import styles from './workspace.module.scss';
import { Component } from '../../../component/component.ui';
import { defaultComponent } from './default-component';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '../../../react-router/slot-router';

const WORKSPACE = gql`
  {
    workspace {
      name
      path
      components {
        id
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
  const { loading, error, data } = useQuery(WORKSPACE);
  const [, selectComponent] = useState<Component>(defaultComponent);

  if (loading) return <div>loading</div>;
  if (error) return <div>{error.message}</div>;

  const workspace = WorkspaceModel.from(data.workspace);

  return (
    <WorkspaceProvider workspace={workspace}>
      <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
      <Theme>
        <div className={styles.explorer}>
          <div className={styles.scopeName}>
            <span className={styles.avatar}>A</span> {workspace.name}
          </div>
          <SideBar
            className={styles.sideBar}
            components={workspace.components}
            onSelectComponent={component => selectComponent(component)}
          />
          <SlotRouter slot={routeSlot} />
        </div>
      </Theme>
    </WorkspaceProvider>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};
