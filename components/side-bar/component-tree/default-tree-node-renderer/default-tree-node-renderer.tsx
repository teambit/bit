import React from 'react';
import { PayloadType } from '../payload-type';
import { TreeNodeProps } from '../recursive-tree';
import { ComponentView } from '../component-view';
import { ScopeView, NamespaceView } from '../component-nodes';

export const scopeRegEx = /^[\w-]+\.[\w-]+\/$/;

export function DefaultTreeNodeRenderer(props: TreeNodeProps<PayloadType>) {
  const children = props.node.children;
  if (!children) return <ComponentView {...props} />;

  const isScope = scopeRegEx.test(props.node.id);
  if (isScope) return <ScopeView {...props} />;

  return <NamespaceView {...props} />;
}
