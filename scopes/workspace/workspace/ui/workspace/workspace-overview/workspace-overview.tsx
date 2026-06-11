import React, { useContext } from 'react';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { ComponentsOverview } from '@teambit/explorer.ui.components-overview';
import { WorkspaceContext } from '../workspace-context';
import { WorkspaceBlankState } from './workspace-blank-state';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components, componentDescriptors } = workspace;
  const { isMinimal } = useWorkspaceMode();

  if (!components.length) return <WorkspaceBlankState />;

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
