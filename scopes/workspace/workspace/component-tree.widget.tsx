import { ComponentTreeNode, ComponentTreeNodeProps } from '@teambit/component-tree';
import { ComponentStatusResolver } from '@teambit/component.ui.component-status-resolver';
import { useLanes } from '@teambit/lanes.ui.hooks';
import React, { useContext, useMemo } from 'react';

import { WorkspaceContext } from './ui/workspace/workspace-context';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    const workspace = useContext(WorkspaceContext);
    const workspaceComponent = workspace.getComponent(component.id);
    const { lanesModel } = useLanes();

    const isInCurrentLane = useMemo(() => {
      return workspaceComponent?.id && lanesModel?.isInViewedLane(workspaceComponent.id);
    }, [lanesModel?.viewedLane, workspaceComponent?.id]);

    if (!workspaceComponent) return null;

    return (
      <ComponentStatusResolver
        status={workspaceComponent.status}
        issuesCount={workspaceComponent.issuesCount}
        isInCurrentLane={isInCurrentLane}
      />
    );
  };
}
