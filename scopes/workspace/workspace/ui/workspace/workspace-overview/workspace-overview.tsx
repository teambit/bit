import React, { useContext } from 'react';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { ComponentsOverview, ComponentsOverviewSkeleton } from '@teambit/explorer.ui.components-overview';
import { WorkspaceContext, WorkspaceUIContext } from '../workspace-context';
import { WorkspaceBlankState } from './workspace-blank-state';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { resolved } = useContext(WorkspaceUIContext);
  const { components, componentDescriptors } = workspace;
  const { isMinimal } = useWorkspaceMode();

  if (!components.length) {
    // An empty `components` means "the workspace has none" only once the light query has actually
    // resolved. Before that the model is a placeholder, and a settled-but-failed query (errorPolicy
    // 'all' returns no data with loading=false) looks identical — both must render the grid
    // skeleton, never the "create your first component" blank state.
    if (!resolved) return <ComponentsOverviewSkeleton />;
    return <WorkspaceBlankState />;
  }

  return (
    <ComponentsOverview
      components={components}
      componentDescriptors={componentDescriptors}
      showPreview={isMinimal}
      storageNamespace="workspace-overview"
      emptyState={<WorkspaceBlankState />}
    />
  );
}
