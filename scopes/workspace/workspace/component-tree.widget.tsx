import { ComponentTreeNode, ComponentTreeNodeProps } from '@teambit/component-tree';
import { ComponentStatusResolver } from '@teambit/component.ui.component-status-resolver';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import React, { useMemo } from 'react';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    const { lanesModel } = useLanes();

    const isInCurrentLane = useMemo(() => {
      return component.id && lanesModel?.isInViewedLane(component.id);
    }, [lanesModel?.viewedLane, component.id]);

    return (
      <ComponentStatusResolver
        status={component.status}
        issuesCount={component.issuesCount}
        isInCurrentLane={isInCurrentLane}
      />
    );
  };
}
