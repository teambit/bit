import { ComponentTreeNode, ComponentTreeNodeProps } from '@teambit/component-tree';
import { ComponentStatusResolver } from '@teambit/component.ui.component-status-resolver';
import React, { useContext } from 'react';

import { useLanesContext } from '@teambit/lanes.lanes.ui';
import { WorkspaceContext } from './ui/workspace/workspace-context';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    const workspace = useContext(WorkspaceContext);
    const workspaceComponent = workspace.getComponent(component.id);
    const lanes = useLanesContext();
    if (!workspaceComponent) return null;

    const isInCurrentLane = lanes.model.currentLane?.components.some(
      (comp) => comp.model.id.name === workspaceComponent.id.name
    );

    return (
      <ComponentStatusResolver
        status={workspaceComponent.status}
        issuesCount={workspaceComponent.issuesCount}
        isInCurrentLane={isInCurrentLane}
      />
    );
  };
}
