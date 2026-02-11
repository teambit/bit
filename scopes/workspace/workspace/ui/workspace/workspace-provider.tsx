import type { ReactNode } from 'react';
import React from 'react';

import { WorkspaceContext, WorkspaceUIContext } from './workspace-context';
import type { Workspace } from './workspace-model';

export type WorkspaceProviderProps = {
  /**
   * workspace model.
   */
  workspace: Workspace;
  /**
   * whether the initial workspace query is still loading.
   */
  loading?: boolean;
  /**
   * whether deferred status query is currently in-flight.
   */
  statusLoading?: boolean;
  /**
   * whether deferred status query has completed at least once.
   */
  statusReady?: boolean;

  /**
   * react children.
   */
  children: ReactNode;
};

/**
 * context provider of the workspace
 */
export function WorkspaceProvider({
  workspace,
  loading = false,
  statusLoading = false,
  statusReady = false,
  children,
}: WorkspaceProviderProps) {
  return (
    <WorkspaceUIContext.Provider
      value={{
        workspace,
        loading,
        statusLoading,
        statusReady,
      }}
    >
      <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
    </WorkspaceUIContext.Provider>
  );
}
