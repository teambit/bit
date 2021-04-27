import React from 'react';
import type { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import { PayloadType, ScopePayload } from '../payload-type';

import { ComponentView } from '../component-view';
import { ScopeTreeNode } from '../scope-tree-node';
import { NamespaceTreeNode } from '../namespace-tree-node';

export function DefaultTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const children = props.node.children;
  if (!children) return <ComponentView {...props} />;

  if (props.node.payload instanceof ScopePayload) return <ScopeTreeNode {...props} />;

  return <NamespaceTreeNode {...props} />;
}
