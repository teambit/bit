import { createContext } from 'react';
import { Workspace as WorkspaceModel } from './workspace-model';

export const WorkspaceContext = createContext<WorkspaceModel>(WorkspaceModel.empty());
