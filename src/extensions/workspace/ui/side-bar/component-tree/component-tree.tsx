import React, { useMemo } from 'react';
import classNames from 'classnames';

import { inflateToTree } from './inflate-paths';
import { TreeNodeContext, TreeNode } from './recursive-tree';
import { /* ScopeView, */ NamespaceView } from './component-nodes';
import { ComponentView } from './component-view';
import { ComponentTreeContextProvider } from './component-tree-context';

import styles from './component-tree.module.scss';
import { indentStyle } from './indent';

type ComponentTreeProps = {
  /** component ids. These will be split by path segments and rendered as a tree */
  components: string[];
  /** triggered when a component is selected from the tree */
  onSelectItem?: (
    /** id of selected component */
    id: string,
    /** the event which triggered selection. Use `event.preventDefault()` to avoid automatic redirect */
    event?: React.MouseEvent
  ) => void;
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentTree(props: ComponentTreeProps) {
  const { components, onSelectItem, /* selected, */ className, ...rest } = props;

  const rootNode = useMemo(() => inflateToTree(components), [components]);

  return (
    <div {...rest} className={classNames(styles.componentTree, className)} style={indentStyle(0)}>
      <TreeNodeContext.Provider value={getTreeNodeComponent}>
        <ComponentTreeContextProvider onSelect={onSelectItem} /* selected={selected} */>
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
