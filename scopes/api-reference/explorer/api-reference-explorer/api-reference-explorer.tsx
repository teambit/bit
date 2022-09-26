import React, { HTMLAttributes, useState } from 'react';
import classNames from 'classnames';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';

import styles from './api-reference-explorer.module.scss';

export type APIReferenceExplorerProps = {
  apiTree: string[];
  selectedAPIName: string;
} & HTMLAttributes<HTMLDivElement>;

export function APIReferenceExplorer({ apiTree, selectedAPIName, className }: APIReferenceExplorerProps) {
  const [drawerOpen, onToggleDrawer] = useState(true);

  return (
    <div className={classNames(styles.apiReferenceExplorer, className)}>
      <DrawerUI
        isOpen={drawerOpen}
        onToggle={() => onToggleDrawer((open) => !open)}
        name={'API'}
        contentClass={styles.apiReferenceExplorerDrawerContent}
        className={classNames(styles.apiReferenceExplorerTabDrawer)}
      >
        <FileTree
          getHref={(node) => useUpdatedUrlFromQuery({ selectedAPI: node.id })}
          files={apiTree}
          selected={selectedAPIName}
          // getIcon={getIcon(fileIconMatchers)}
        />
      </DrawerUI>
    </div>
  );
}
