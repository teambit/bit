import React, { useMemo, useCallback } from 'react';
import { ComponentTreeSlot } from '@teambit/component-tree';
import { ComponentModel } from '@teambit/component';
import { inflateToTree } from './inflate-paths';
import { TreeNodeContext, TreeNodeProps } from './recursive-tree';
import { /* ScopeView, */ NamespaceView } from './component-nodes';
import { ComponentView } from './component-view';
import { ComponentTreeContextProvider } from './component-tree-context';
import { RootNode } from './root-node';

import { indentStyle } from './indent';
import { Component } from './../side-bar';
import { PayloadType } from './payload-type';
import styles from './component-tree.module.scss';

type ComponentTreeProps = {
  onSelect?: (id: string, event?: React.MouseEvent) => void;
  selected?: string;
  components: ComponentModel[];
  treeNodeSlot: ComponentTreeSlot;
};

export function ComponentTree({ components, onSelect, selected, treeNodeSlot }: ComponentTreeProps) {
  const rootNode = useMemo(
    () =>
      inflateToTree(
        components,
        (c) => c.id.fullName,
        (c) => c as PayloadType
      ),
    [components]
  );

  const TreeNodeRenderer = useCallback(
    function TreeNode(props: TreeNodeProps<PayloadType>) {
      const children = props.node.children;

      if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;
      // // TODO - handle scopes view
      // if (!id.includes('/')) return ScopeView;
      return <NamespaceView {...props} />;
    },
    [treeNodeSlot]
  );

  return (
    <div className={styles.componentTree} style={indentStyle(0)}>
      <TreeNodeContext.Provider value={TreeNodeRenderer}>
        <ComponentTreeContextProvider onSelect={onSelect} selected={selected}>
          <RootNode node={rootNode} />
        </ComponentTreeContextProvider>
      </TreeNodeContext.Provider>
    </div>
  );
}
