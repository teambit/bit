import { ComponentTreeNode, ComponentTreeNodeProps } from '@teambit/component-tree';
import { ComponentStatusResolver } from '@teambit/component.ui.component-status-resolver';
import React, { useContext, useMemo } from 'react';

import { useLanesContext } from '@teambit/lanes.ui.lanes';
import { WorkspaceContext } from './ui/workspace/workspace-context';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    const workspace = useContext(WorkspaceContext);
    const workspaceComponent = workspace.getComponent(component.id);
    const lanes = useLanesContext();

    const isInCurrentLane = useMemo(() => {
      return workspaceComponent?.id && lanes?.isInViewedLane(workspaceComponent.id);
    }, [lanes?.viewedLane, workspaceComponent?.id]);

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
