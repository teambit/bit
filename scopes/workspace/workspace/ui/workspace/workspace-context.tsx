import { createContext } from 'react';

import { Workspace as WorkspaceModel } from './workspace-model';

export const WorkspaceContext: React.Context<WorkspaceModel> = createContext<WorkspaceModel>(WorkspaceModel.empty());

export type WorkspaceUIContextModel = {
  workspace: WorkspaceModel;
  loading: boolean;
  statusLoading: boolean;
  statusReady: boolean;
};

export const WorkspaceUIContext: React.Context<WorkspaceUIContextModel> = createContext<WorkspaceUIContextModel>({
  workspace: WorkspaceModel.empty(),
  loading: true,
  statusLoading: false,
  statusReady: false,
});
