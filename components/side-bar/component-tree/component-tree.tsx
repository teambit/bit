import { ComponentModel } from '@teambit/component';
import React, { useMemo } from 'react';
import { ComponentTreeContextProvider } from './component-tree-context';
import { indentStyle } from './indent';
import { inflateToTree } from './inflate-paths';
import { PayloadType } from './payload-type';
import { TreeNodeContext, TreeNodeRenderer } from './recursive-tree';
import { RootNode } from './root-node';
import { DefaultTreeNodeRenderer } from './default-tree-node-renderer';

type ComponentTreeProps = {
  onSelect?: (id: string, event?: React.MouseEvent) => void;
  selected?: string;
  components: ComponentModel[];
  TreeNode?: TreeNodeRenderer<PayloadType>;
};

export function ComponentTree({
  components,
  onSelect,
  selected,
  TreeNode = DefaultTreeNodeRenderer,
}: ComponentTreeProps) {
  const rootNode = useMemo(
    () =>
      inflateToTree(
        components,
        (c) => c.id.toString({ ignoreVersion: true }),
        (c) => c as PayloadType
      ),
    [components]
  );

  return (
    <div style={indentStyle(1)}>
      <TreeNodeContext.Provider value={TreeNode}>
        <ComponentTreeContextProvider onSelect={onSelect} selected={selected}>
          <RootNode node={rootNode} depth={1} />
        </ComponentTreeContextProvider>
      </TreeNodeContext.Provider>
    </div>
  );
}
