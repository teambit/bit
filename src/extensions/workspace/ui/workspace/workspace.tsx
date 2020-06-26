import React, { useState } from 'react';
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

/**
 * main workspace component.
 */
export function Workspace({ topBarSlot, pageSlot }: WorkspaceProps) {
  const { loading, error, data } = useQuery(WORKSPACE);
  const [selectedComponent, selectComponent] = useState<string | undefined>();

  if (loading) return <div>loading</div>;
  if (error) return <div>{error.message}</div>;

  const workspace = data.workspace;

  return (
    <WorkspaceContext>
      <div className={styles.explorer}>
        <div className={styles.scopeName}>
          <span className={styles.avatar}>A</span> Google / <b>material-ui</b>
        </div>
        <SideBar
          className={styles.sideBar}
          components={workspace.components}
          onSelectComponent={selectComponent}
          selected={selectedComponent}
        />
        <Route path="/:slug([^~]+)">
          <TopBar className={styles.topbar} topBarSlot={topBarSlot} currentTag={currentTag} />
          <Stage pageSlot={pageSlot} />
        </Route>
      </div>
    </WorkspaceContext>
  );
}

function WorkspaceContext({ children }) {
  return (
    <HashRouter>
      {/* TODO - use 'icon-font' component */}
      <link rel="stylesheet" href="https://i.icomoon.io/public/9dc81da9ad/Bit/style.css"></link>
      <Theme>{children}</Theme>
    </HashRouter>
  );
}

// TEMP!
const currentTag = {
  version: '5.0.10',
  downloads: 542,
  likes: 86
};
