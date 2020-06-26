import React, { useState, ReactNode } from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';
import { HashRouter, Route } from 'react-router-dom';
import 'reset-css';
import { SideBar } from '../side-bar';
import { TopBar } from '../top-bar';
import { TopBarSlotRegistry, PageSlotRegistry } from '../../workspace.ui';
import { Stage } from '../stage';
import styles from './workspace.module.scss';
import { ComponentProvider } from './component-provider';
import { Component } from '../../../component/component.ui';
import { defaultComponent } from './default-component';

const WORKSPACE = gql`
  {
    workspace {
      path
      components {
        id
        devServer {
          env
          url
        }
      }
    }
  }
`;

export type WorkspaceProps = {
  topBarSlot: TopBarSlotRegistry;
  pageSlot: PageSlotRegistry;
};

// TEMP!
const currentTag = {
  version: '5.0.10',
  downloads: 542,
  likes: 86
};

/**
 * main workspace component.
 */
export function Workspace({ topBarSlot, pageSlot }: WorkspaceProps) {
  const { loading, error, data } = useQuery(WORKSPACE);
  const [selectedComponent, selectComponent] = useState<Component>(defaultComponent);

  if (loading) return <div>loading</div>;
  if (error) return <div>{error.message}</div>;

  const workspace = data.workspace;

  return (
    <ComponentProvider component={selectedComponent}>
      <WorkspaceContext>
        <div className={styles.explorer}>
          <div className={styles.scopeName}>
            <span className={styles.avatar}>A</span> Google / <b>material-ui</b>
          </div>
          <SideBar
            className={styles.sideBar}
            components={workspace.components}
            onSelectComponent={component => selectComponent(component)}
          />
          <Route path="/:slug([^~]+)">
            <TopBar className={styles.topbar} topBarSlot={topBarSlot} currentTag={currentTag} />
            <Stage pageSlot={pageSlot} />
          </Route>
        </div>
      </WorkspaceContext>
    </ComponentProvider>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};

function WorkspaceContext({ children }: WorkspaceContextProps) {
  return (
    <HashRouter>
      {/* TODO - use 'icon-font' component */}
      <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
      <Theme>{children}</Theme>
    </HashRouter>
  );
}
