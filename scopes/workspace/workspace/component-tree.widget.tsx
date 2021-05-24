import { ComponentTreeNode, ComponentTreeNodeProps } from '@teambit/component-tree';
import { ComponentStatusResolver } from '@teambit/component.ui.component-status-resolver';
import React, { useContext } from 'react';

import { WorkspaceContext } from './ui/workspace/workspace-context';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    const workspace = useContext(WorkspaceContext);

    const workspaceComponent = workspace.getComponent(component.id);
    if (!workspaceComponent) return null;

    return <ComponentStatusResolver status={workspaceComponent.status} issuesCount={workspaceComponent.issuesCount} />;
  };
}
