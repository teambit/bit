import React, { Component } from 'react';
import memoizeOne from 'memoize-one';

import { inflateToTree } from './inflate-paths';
import { TreeNodeContext, TreeNode } from './recursive-tree';

import { ComponentTreeContext } from './component-tree-context';
import { ScopeView, ComponentView, NamespaceView } from './component-nodes';

type ComponentTreeProps = {
  onSelect: (id: string) => any;
  selected?: string;
  components: string[];
};

export class ComponentTree extends Component<ComponentTreeProps> {
  getRootNode = memoizeOne((componentList: string[]) => {
    return inflateToTree(componentList);
  });

  render() {
    const treeContext = { onSelect: this.props.onSelect, selected: this.props.selected }; //TODO - memoize
    const rootNode = this.getRootNode(this.props.components);

    return (
      <div>
        <TreeNodeContext.Provider value={getTreeNodeComponent}>
          <ComponentTreeContext.Provider value={treeContext}>
            <ScopeView node={rootNode} depth={0} />
          </ComponentTreeContext.Provider>
        </TreeNodeContext.Provider>
      </div>
    );
  }
}

function getTreeNodeComponent(node: TreeNode) {
  const { id, children } = node;

  if (!children) return ComponentView;
  if (!id.includes('/')) return ScopeView;
  return NamespaceView;
}
