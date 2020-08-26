import { ComponentModel } from '@teambit/component';
import { ComponentTreeSlot } from '@teambit/component-tree';
import React, { useCallback, useMemo } from 'react';

import { /* ScopeView, */ NamespaceView } from './component-nodes';
import { ComponentTreeContextProvider } from './component-tree-context';
import { ComponentView } from './component-view';
import { indentStyle } from './indent';
import { inflateToTree } from './inflate-paths';
import { PayloadType } from './payload-type';
import { TreeNodeContext, TreeNodeProps } from './recursive-tree';
import { RootNode } from './root-node';

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
    <div style={indentStyle(0)}>
      <TreeNodeContext.Provider value={TreeNodeRenderer}>
        <ComponentTreeContextProvider onSelect={onSelect} selected={selected}>
          <RootNode node={rootNode} />
        </ComponentTreeContextProvider>
      </TreeNodeContext.Provider>
    </div>
  );
}
