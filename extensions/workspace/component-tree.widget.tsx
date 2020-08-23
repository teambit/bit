import React, { useContext } from 'react';
import { ComponentTreeNode, ComponentTreeNodeProps } from '@teambit/component-tree';
import { WorkspaceContext } from '../ui/workspace/workspace-context';
import { ComponentStatusResolver } from '@teambit/stage-components.side-bar.component-tree';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    const workspace = useContext(WorkspaceContext);

    const workspaceComponent = workspace.getComponent(component.id);
    if (!workspaceComponent) return null;
    return <ComponentStatusResolver id={component.id} status={workspaceComponent.status} />;
  };
}
