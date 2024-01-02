import React from 'react';
import { ComponentTreeNode, ComponentTreeNodeProps } from '@teambit/component-tree';
import { ComponentStatusResolver } from '@teambit/component.ui.component-status-resolver';

export class ComponentTreeWidget implements ComponentTreeNode {
  widget = ({ component }: ComponentTreeNodeProps) => {
    return <ComponentStatusResolver status={component.status} issuesCount={component.issuesCount} />;
  };
}
