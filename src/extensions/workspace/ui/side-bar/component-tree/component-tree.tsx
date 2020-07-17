import React, { useMemo } from 'react';
import { inflateToTree } from './inflate-paths';
import { TreeNodeContext, TreeNode } from './recursive-tree';
import { /* ScopeView, */ NamespaceView } from './component-nodes';
import { ComponentView } from './component-view';
import { ComponentTreeContextProvider } from './component-tree-context';

import styles from './component-tree.module.scss';
import { indentStyle } from './indent';

type ComponentTreeProps = {
  onSelect?: (id: string, event?: React.MouseEvent) => void;
  selected?: string;
  components: string[];
};

export function ComponentTree(props: ComponentTreeProps) {
  const { components, onSelect, selected } = props;

  const rootNode = useMemo(() => inflateToTree(components), [components]);

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

function RootNode({ node }: { node: TreeNode }) {
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

function getTreeNodeComponent(node: TreeNode) {
  const { children } = node;

  if (!children) return ComponentView;
  // TODO - how to tell scopes from namespaces?
  // if (!id.includes('/')) return ScopeView;
  return NamespaceView;
}
