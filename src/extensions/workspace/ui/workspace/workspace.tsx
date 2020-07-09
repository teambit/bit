import React, { ReactNode } from 'react';

import { SideBar } from '../side-bar';
import styles from './workspace.module.scss';
import { WorkspaceProvider } from './workspace-provider';
import { RouteSlot, SlotRouter } from '../../../react-router/slot-router';
import { FullLoader } from '../../../../to-eject/full-loader';
import { useWorkspaceQuery } from './use-workspace-query';

export type WorkspaceProps = {
  routeSlot: RouteSlot;
};

/**
 * main workspace component.
 */
export function Workspace({ routeSlot }: WorkspaceProps) {
  const { workspace } = useWorkspaceQuery();

  if (!workspace) {
    return (
      <div className={styles.emptyContainer}>
        <FullLoader />
      </div>
    );
  }

  return (
    <WorkspaceProvider workspace={workspace}>
      <div className={styles.workspace}>
        <Corner name={workspace.name} />
        {workspace.components && <SideBar className={styles.sideBar} components={workspace.components} />}
        <div className={styles.main}>
          <SlotRouter slot={routeSlot} />
        </div>
      </div>
    </WorkspaceProvider>
  );
}

function Corner({ name }: { name?: string }) {
  return (
    <div className={styles.corner}>
      <span className={styles.avatar}>A</span> {name}
    </div>
  );
}

export type WorkspaceContextProps = {
  children: ReactNode;
};
