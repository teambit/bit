import React from 'react';
import type { TreeNodeProps } from '@teambit/base-ui.graph.tree.recursive-tree';
import type { PayloadType } from '../payload-type';
import { ScopePayload } from '../payload-type';

import { ComponentView } from '../component-view';
import { ScopeTreeNode } from '../scope-tree-node';
import { NamespaceTreeNode } from '../namespace-tree-node';

export function DefaultTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const { node } = props;
  const { children, payload } = node;
  if (!children) return <ComponentView {...props} />;

  if (payload instanceof ScopePayload) return <ScopeTreeNode {...props} />;

  return <NamespaceTreeNode {...props} />;
}
