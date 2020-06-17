import React, { Component } from 'react';
import memoizeOne from 'memoize-one';

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

export class ComponentTree extends Component<ComponentTreeProps> {
  getRootNode = memoizeOne((componentList: string[]) => {
    return inflateToTree(componentList);
  });

  treeContext = memoizeOne((onSelect, selected) => {
    return { onSelect, selected };
  });

  render() {
    const treeContext = this.treeContext(this.props.onSelect, this.props.selected);
    const rootNode = this.getRootNode(this.props.components);

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
}

function RootNode({ node }: { node: TreeNode }) {
  const Node = getTreeNodeComponent(node);

  return <Node node={node} depth={0} />;
}

function getTreeNodeComponent(node: TreeNode) {
  const { id, children } = node;

  if (!children) return ComponentView;
  // TODO - how to tell scopes from namespaces?
  // if (!id.includes('/')) return ScopeView;
  return NamespaceView;
}
