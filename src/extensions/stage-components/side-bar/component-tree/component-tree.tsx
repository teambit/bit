import React, { useMemo, ComponentType } from 'react';
import { inflateToTree } from './inflate-paths';
import { TreeNodeContext, TreeNode } from './recursive-tree';
import { /* ScopeView, */ NamespaceView } from './component-nodes';
import { ComponentView, ComponentViewProps } from './component-view';
import { ComponentTreeContextProvider } from './component-tree-context';

import styles from './component-tree.module.scss';
import { indentStyle } from './indent';
import { Component } from './../side-bar';
import { PayloadType } from './payload-type';

type ComponentTreeProps = {
  onSelect?: (id: string, event?: React.MouseEvent) => void;
  selected?: string;
  components: Component[];
};

export function ComponentTree(props: ComponentTreeProps) {
  const { components, onSelect, selected } = props;

  const rootNode = useMemo(
    () =>
      inflateToTree(
        components,
        (c) => c.id.fullName,
        (c) => c as PayloadType
      ),
    [components]
  );

  return (
    <div className={styles.componentTree} style={indentStyle(0)}>
      <TreeNodeContext.Provider value={getTreeNodeComponent}>
        <ComponentTreeContextProvider onSelect={onSelect} selected={selected}>
          <RootNode node={rootNode} />
        </ComponentTreeContextProvider>
      </TreeNodeContext.Provider>
    </div>
  );
}

function RootNode({ node }: { node: TreeNode<PayloadType> }) {
  if (!node.id) {
    if (!node.children) return null;

    return (
      <>
        {node.children.map((rootNode) => (
          <RootNode key={rootNode.id} node={rootNode} />
        ))}
      </>
    );
  }

  const Node = getTreeNodeComponent(node);

  return <Node node={node} depth={0} />;
}

function getTreeNodeComponent(node: TreeNode<PayloadType>): ComponentType<ComponentViewProps<PayloadType>> {
  const { children } = node;

  if (!children) return ComponentView;
  // TODO - how to tell scopes from namespaces?
  // if (!id.includes('/')) return ScopeView;
  return NamespaceView;
}
