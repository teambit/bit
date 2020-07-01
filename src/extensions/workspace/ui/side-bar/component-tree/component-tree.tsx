import React, { useMemo } from 'react';
import { inflateToTree } from './inflate-paths';
import { TreeNodeContext, TreeNode } from './recursive-tree';
import { ComponentTreeContext } from './component-tree-context';
import { /* ScopeView, */ ComponentView, NamespaceView } from './component-nodes';
import styles from './component-tree.module.scss';
import { indentStyle } from './indent';

type ComponentTreeProps = {
  onSelect: (id: string) => any;
  selected?: string;
  components: string[];
};

export function ComponentTree(props: ComponentTreeProps) {
  const { components, onSelect, selected } = props;

  const treeContext = useMemo(() => ({ onSelect, selected }), [onSelect, selected]);
  const rootNode = useMemo(() => inflateToTree(components), [components]);

  return (
    <div className={styles.componentTree} style={indentStyle(0)}>
      <TreeNodeContext.Provider value={getTreeNodeComponent}>
        <ComponentTreeContext.Provider value={treeContext}>
          <RootNode node={rootNode} />
        </ComponentTreeContext.Provider>
      </TreeNodeContext.Provider>
    </div>
  );
}

function RootNode({ node }: { node: TreeNode }) {
  if (!node.id) {
    if (!node.children) return null;

    return (
      <>
        {node.children.map(rootNode => (
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
