import React, { useContext } from 'react';
import { TreeContext } from '@teambit/base-ui.graph.tree.tree-context';
import { TreeNodeProps } from '@teambit/design.ui.tree';
import { TreeNode as Node } from '@teambit/ui-foundation.ui.tree.tree-node';
import { FolderTreeNode } from '@teambit/ui-foundation.ui.tree.folder-tree-node';
import { useFileTreeContext } from './file-tree.context';

export function FileTreeNode(props: TreeNodeProps<any>) {
  const { node } = props;
  const fileTreeContext = useFileTreeContext();
  const { selected, onSelect } = useContext(TreeContext);

  const href = fileTreeContext?.getHref?.(node);
  const widgets = fileTreeContext?.widgets;
  const icon = fileTreeContext?.getIcon?.(node);

  if (!node?.children) {
    return (
      <Node
        {...props}
        onClick={onSelect && ((e) => onSelect(node.id, e))}
        href={href}
        isActive={node?.id === selected}
        icon={icon}
        widgets={widgets}
      />
    );
  }
  return <FolderTreeNode {...props} />;
}
