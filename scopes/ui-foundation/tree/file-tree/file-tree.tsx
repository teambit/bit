import React, { useMemo, HTMLAttributes, ComponentType } from 'react';
import { inflateToTree } from '@teambit/base-ui.graph.tree.inflate-paths';
import { TreeContextProvider } from '@teambit/base-ui.graph.tree.tree-context';
import { indentStyle } from '@teambit/base-ui.graph.tree.indent';
import { RootNode } from '@teambit/base-ui.graph.tree.root-node';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { TreeNodeContext } from '@teambit/base-ui.graph.tree.recursive-tree';
import { TreeNode, TreeNodeRenderer } from '@teambit/design.ui.tree';
import { FileTreeNode } from './file-tree.node';
import { FileTreeContext } from './file-tree.context';

type FileTreeProps = {
  onSelect?: (id: string, event?: React.MouseEvent) => void;
  selected?: string;
  files: string[];
  widgets?: ComponentType<WidgetProps<any>>[];
  getHref?: (node: TreeNode) => string;
  getIcon?: (node: TreeNode) => string | undefined;
  TreeNode?: TreeNodeRenderer;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Renders a tree of folders and files from an array of file path's
 */
export function FileTree({
  files,
  onSelect,
  selected,
  getIcon,
  getHref,
  widgets,
  TreeNode: CustomTreeNode = FileTreeNode,
  ...rest
}: FileTreeProps) {
  const rootNode = useMemo(() => {
    // make sure that Windows paths are converted to posix
    const filePaths = files.map((f) => f.replace(/\\/g, '/'));
    const tree = inflateToTree(filePaths, (c) => c);
    return tree;
  }, [files]);

  return (
    <FileTreeContext.Provider value={{ getIcon, getHref, widgets }}>
      <div style={{ ...indentStyle(1), ...rest.style }} {...rest}>
        <TreeNodeContext.Provider value={CustomTreeNode}>
          <TreeContextProvider onSelect={onSelect} selected={selected}>
            <RootNode node={rootNode} depth={1} />
          </TreeContextProvider>
        </TreeNodeContext.Provider>
      </div>
    </FileTreeContext.Provider>
  );
}
