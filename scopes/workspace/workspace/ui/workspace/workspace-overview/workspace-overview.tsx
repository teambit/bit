import React, { useContext } from 'react';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { ComponentsOverview, ComponentsOverviewSkeleton } from '@teambit/explorer.ui.components-overview';
import { WorkspaceContext, WorkspaceUIContext } from '../workspace-context';
import { WorkspaceBlankState } from './workspace-blank-state';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { loading } = useContext(WorkspaceUIContext);
  const { components, componentDescriptors } = workspace;
  const { isMinimal } = useWorkspaceMode();

  if (!components.length) {
    // While the initial (light) workspace query is still in flight the model is an empty
    // placeholder — show the grid skeleton, not the "create your first component" blank state.
    if (loading) return <ComponentsOverviewSkeleton />;
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
