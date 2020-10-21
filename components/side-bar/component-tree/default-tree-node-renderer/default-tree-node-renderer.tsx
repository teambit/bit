import React from 'react';
import { PayloadType, ScopePayload } from '../payload-type';
import { TreeNodeProps } from '../recursive-tree';
import { ComponentView } from '../component-view';
import { ScopeView, NamespaceView } from '../component-nodes';

export function DefaultTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const children = props.node.children;
  if (!children) return <ComponentView {...props} />;

  if (props.node.payload instanceof ScopePayload) return <ScopeView {...props} />;

  return <NamespaceView {...props} />;
}
