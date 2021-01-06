import React, { useMemo } from 'react';
import { inflateToTree } from '@teambit/base-ui.graph.tree.inflate-paths';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { RootNode } from '@teambit/base-ui.graph.tree.root-node';
import { TreeNodeContext, TreeNodeRenderer } from '@teambit/base-ui.graph.tree.recursive-tree';

type FileTreeProps = {
  onSelect?: (id: string, event?: React.MouseEvent) => void;
  selected?: string;
  files: string[];
  TreeNode: TreeNodeRenderer<any>; // - is this ok?
};

export function FileTree({ files, onSelect, selected, TreeNode }: FileTreeProps) {
  const rootNode = useMemo(() => {
    const tree = inflateToTree(files, (c) => c);
    return tree;
  }, [files]);

  return (
    <div style={indentStyle(1)}>
      <TreeNodeContext.Provider value={TreeNode}>
        <TreeContextProvider onSelect={onSelect} selected={selected}>
          <RootNode node={rootNode} depth={1} />
        </TreeContextProvider>
      </TreeNodeContext.Provider>
    </div>
  );
}
