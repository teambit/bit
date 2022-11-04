import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';
import { TreeNode } from '@teambit/design.ui.tree';

import styles from './api-reference-explorer.module.scss';

export type APIReferenceExplorerProps = {
  apiTree: string[];
  selectedAPIName: string;
  getIcon?: (node: TreeNode) => string | undefined;
} & HTMLAttributes<HTMLDivElement>;

export function APIReferenceExplorer({ apiTree, selectedAPIName, className, getIcon }: APIReferenceExplorerProps) {
  return (
    <div className={classNames(styles.apiReferenceExplorer, className)}>
      <FileTree
        getHref={(node) => useUpdatedUrlFromQuery({ selectedAPI: node.id.split('/')[1] })}
        files={apiTree}
        selected={selectedAPIName}
        getIcon={getIcon}
      />
    </div>
  );
}
