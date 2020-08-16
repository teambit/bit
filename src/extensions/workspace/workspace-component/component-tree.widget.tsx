import React, { useContext } from 'react';
import { ComponentTreeNode, ComponentTreeNodeProps } from '../../component-tree';
import { WorkspaceContext } from '../ui/workspace/workspace-context';
import { ComponentStatusResolver } from '../../../components/stage-components/side-bar/component-tree/component-status-resolver';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    const workspace = useContext(WorkspaceContext);

    const workspaceComponent = workspace.getComponent(component.id);
    if (!workspaceComponent) return null;
    return <ComponentStatusResolver status={workspaceComponent.status} />;
  };
}
