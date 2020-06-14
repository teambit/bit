import React, { useState } from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
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
};

/**
 * main workspace component.
 */
export function Workspace({ topBarSlot }: WorkspaceProps) {
  const { loading, error, data } = useQuery(WORKSPACE);
  const [stage, setStage] = useState(<div></div>);
  const [selectedComponent, selectComponent] = useState<string | undefined>();

  if (loading) return <div>loading</div>;
  if (error) return <div>{error.message}</div>;

  const workspace = data.workspace;

  return (
    <div className={styles.explorer}>
      <div className={styles.scopeName}>componentName</div>
      <TopBar className={styles.topbar} topBarSlot={topBarSlot} onStageSelect={stageElm => setStage(stageElm)} />
      <SideBar components={workspace.components} onSelectComponent={selectComponent} selected={selectedComponent} />
      <Stage>{stage}</Stage>
    </div>
  );
}
