import React, { ReactNode } from 'react';
import { WorkspaceContext } from './workspace-context';
import { WorkspaceModel } from './workspace-model';

export type WorkspaceProviderProps = {
  /**
   * workspace model.
   */
  workspace: WorkspaceModel;

  /**
   * react children.
   */
  children: ReactNode;
};

/**
 * context provider of the workspace
 */
export function WorkspaceProvider({ workspace, children }: WorkspaceProviderProps) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}
