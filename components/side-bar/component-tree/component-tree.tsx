import { ComponentModel } from '@teambit/component';
import { ComponentTreeSlot } from '@teambit/component-tree';
import React, { useCallback, useMemo } from 'react';

import { ScopeView, NamespaceView } from './component-nodes';
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
  showScopeDrawer: boolean;
};

const scopeRegEx = /^[\w-]+\.[\w-]+\/$/;

export function ComponentTree({ components, onSelect, selected, treeNodeSlot, showScopeDrawer }: ComponentTreeProps) {
  const rootNode = useMemo(
    () =>
      inflateToTree(
        components,
        (c) => c.id.toString({ ignoreVersion: true }),
        (c) => c as PayloadType
      ),
    [components]
  );

  const TreeNodeRenderer = useCallback(
    function TreeNode(props: TreeNodeProps<PayloadType>) {
      const children = props.node.children;

      if (!children) return <ComponentView {...props} treeNodeSlot={treeNodeSlot} />;

      const isScope = scopeRegEx.test(props.node.id);
      if (isScope) return <ScopeView showScopeDrawer={showScopeDrawer} {...props} />;

      return <NamespaceView {...props} />;
    },
    [treeNodeSlot]
  );

  return (
    <div style={indentStyle(1)}>
      <TreeNodeContext.Provider value={TreeNodeRenderer}>
        <ComponentTreeContextProvider onSelect={onSelect} selected={selected}>
          <RootNode node={rootNode} depth={1} />
        </ComponentTreeContextProvider>
      </TreeNodeContext.Provider>
    </div>
  );
}
