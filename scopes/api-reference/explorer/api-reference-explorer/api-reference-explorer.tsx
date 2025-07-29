import type { HTMLAttributes } from 'react';
import React from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';
import type { TreeNode } from '@teambit/design.ui.tree';

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
        getHref={(node) => {
          const id = node.id;
          const isInternal = id.includes('_Internals');
          const sanitizedId = isInternal ? id.replace('_Internals/', '') : id;
          const selectedAPI = isInternal ? sanitizedId : sanitizedId.split('/')[1];
          return useUpdatedUrlFromQuery({ selectedAPI });
        }}
        files={apiTree}
        selected={selectedAPIName}
        getIcon={getIcon}
      />
    </div>
  );
}
