import { createContext } from 'react';

import { Workspace as WorkspaceModel } from './workspace-model';

export const WorkspaceContext: React.Context<WorkspaceModel> = createContext<WorkspaceModel>(WorkspaceModel.empty());

export type WorkspaceUIContextModel = {
  workspace: WorkspaceModel;
  loading: boolean;
  /** the light workspace query has resolved at least once — an empty `components` is now meaningful */
  resolved: boolean;
  statusLoading: boolean;
  statusReady: boolean;
};

export const WorkspaceUIContext: React.Context<WorkspaceUIContextModel> = createContext<WorkspaceUIContextModel>({
  workspace: WorkspaceModel.empty(),
  loading: true,
  resolved: false,
  statusLoading: false,
  statusReady: false,
});
