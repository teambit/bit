import React, { useState, ReactNode } from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';
import { Switch, Route } from 'react-router-dom';
import 'reset-css';
import { SideBar } from '../side-bar';
// import { TopBar } from '../top-bar';
import { TopBarSlotRegistry, PageSlotRegistry } from '../../workspace.ui';
import { Stage } from '../stage';
import styles from './workspace.module.scss';
import { Component } from '../../../component/component.ui';
import { defaultComponent } from './default-component';
import { Workspace as WorkspaceModel } from './workspace-model';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlotRegistry } from '../../../react-router/react-router.ui';

const WORKSPACE = gql`
  {
    workspace {
      path
      components {
        id
      }
    }
  }
`;

export type WorkspaceProps = {
  topBarSlot: TopBarSlotRegistry;
  pageSlot: PageSlotRegistry;
  routeSlot: RouteSlotRegistry;
};

/**
 * main workspace component.
 */
export function Workspace({ topBarSlot, pageSlot, routeSlot }: WorkspaceProps) {
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
            <span className={styles.avatar}>A</span> Google / <b>material-ui</b>
          </div>
          <SideBar
            className={styles.sideBar}
            components={workspace.components}
            onSelectComponent={component => selectComponent(component)}
          />
          <Switch>{routeSlot.values().map(routeGetter => routeGetter())}</Switch>
          {/* <TopBar className={styles.topbar} topBarSlot={topBarSlot} currentTag={currentTag} />
          <Stage pageSlot={pageSlot} /> */}
        </div>
      </Theme>
    </WorkspaceProvider>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};
