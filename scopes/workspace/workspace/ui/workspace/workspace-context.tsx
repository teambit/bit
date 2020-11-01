import { createContext } from 'react';

import { Workspace as WorkspaceModel } from './workspace-model';

export const WorkspaceContext: React.Context<WorkspaceModel> = createContext<WorkspaceModel>(WorkspaceModel.empty());
