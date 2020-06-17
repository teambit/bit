import React, { useState } from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { Theme } from '@bit/bit.base-ui.theme.theme-provider';
import 'reset-css';

import { SideBar } from '../side-bar';
import { TopBar } from '../top-bar';
import { TopBarSlotRegistry } from '../../workspace.ui';
import { Stage } from '../stage';
import styles from './workspace.module.scss';

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
  stage?: JSX.Element;
};

/**
 * main workspace component.
 */
export function Workspace({ topBarSlot, stage }: WorkspaceProps) {
  const { loading, error, data } = useQuery(WORKSPACE);
  const [selectedComponent, selectComponent] = useState<string | undefined>();

  if (loading) return <div>loading</div>;
  if (error) return <div>{error.message}</div>;

  const workspace = data.workspace;

  return (
    <Theme>
      <div className={styles.explorer}>
        <div className={styles.scopeName}>
          <span className={styles.avatar}>A</span> Google / <b>material-ui</b>
        </div>
        <TopBar className={styles.topbar} topBarSlot={topBarSlot} currentTag={currentTag} />
        <SideBar
          className={styles.sideBar}
          components={workspace.components}
          onSelectComponent={selectComponent}
          selected={selectedComponent}
        />
        <Stage>{stage}</Stage>
      </div>
    </Theme>
  );
}

//TEMP!
const currentTag = {
  version: '5.0.10',
  downloads: 542,
  likes: 86
};
