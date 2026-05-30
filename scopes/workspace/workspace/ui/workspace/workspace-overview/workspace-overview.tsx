import React, { useContext } from 'react';
import { EmptyWorkspace } from '@teambit/workspace.ui.empty-workspace';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { ComponentsOverview } from '@teambit/explorer.ui.components-overview';
import { WorkspaceContext } from '../workspace-context';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components, componentDescriptors } = workspace;
  const { isMinimal } = useWorkspaceMode();

  if (!components.length) return <EmptyWorkspace name={workspace.name} />;

  return (
    <ComponentsOverview
      components={components}
      componentDescriptors={componentDescriptors}
      showPreview={isMinimal}
      storageNamespace="workspace-overview"
      emptyState={<EmptyWorkspace name={workspace.name} />}
    />
  );
}
