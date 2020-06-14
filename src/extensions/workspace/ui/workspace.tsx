import React from 'react';
import { useQuery } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import { SideBar } from './side-bar';
import { TopBar } from './top-bar';
import { TopBarSlotRegistry } from '../workspace.ui';

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

  if (loading) return <div>loading</div>;
  if (error) return <div>{error.message}</div>;

  const workspace = data.workspace;

  return (
    <div>
      <TopBar topBarSlot={topBarSlot} />
      <SideBar components={workspace.components} />
    </div>
  );
}
