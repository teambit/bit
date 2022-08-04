import { TreeNode } from '@teambit/design.ui.tree';
import { WidgetProps } from '@teambit/ui-foundation.ui.tree.tree-node';
import { createContext, useContext, ComponentType } from 'react';
import { TreeNode as TreeNodeType } from '@teambit/base-ui.graph.tree.recursive-tree';

export type FileTreeContextModel = {
  widgets?: ComponentType<WidgetProps<any>>[];
  getHref?: (node: TreeNode) => string;
  getIcon?: (node: TreeNode) => string | undefined;
  onClick?: (e: React.MouseEvent, node: TreeNodeType<any>) => void;
};

export const FileTreeContext = createContext<FileTreeContextModel | undefined>(undefined);
export const useFileTreeContext: () => FileTreeContextModel | undefined = () => {
  const fileTreeContext = useContext(FileTreeContext);
  return fileTreeContext;
};
