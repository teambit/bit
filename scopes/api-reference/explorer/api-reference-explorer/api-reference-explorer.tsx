import React, { HTMLAttributes, useState, useMemo } from 'react';
import flatten from 'lodash.flatten';
import classNames from 'classnames';
import { FileTree } from '@teambit/ui-foundation.ui.tree.file-tree';
import { DrawerUI } from '@teambit/ui-foundation.ui.tree.drawer';
import { APINode, APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';

import styles from './api-reference-explorer.module.scss';

export type APIReferenceExplorerProps = {
  selectedAPINode?: APINode;
  apiReferenceModel: APIReferenceModel;
} & HTMLAttributes<HTMLDivElement>;

export function APIReferenceExplorer({ selectedAPINode, apiReferenceModel, className }: APIReferenceExplorerProps) {
  const apiNodes = flatten(Array.from(apiReferenceModel.apiByType.values())).sort(sortAPINodes);
  const apiTree: string[] = useMemo(() => {
    return apiNodes.map((apiNode) => {
      return `${apiNode.renderer?.nodeType}/${apiNode.renderer?.getName(apiNode.api)}`;
    });
  }, [apiNodes]);
  const [drawerOpen, onToggleDrawer] = useState(true);

  const selectedAPIName =
    (selectedAPINode &&
      `${selectedAPINode?.renderer?.nodeType}/${selectedAPINode?.renderer?.getName(selectedAPINode.api)}`) ||
    apiTree[0];

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

function sortAPINodes(apiNodeA: APINode, apiNodeB: APINode): 1 | -1 | 0 {
  const aNodeType = apiNodeA.renderer.nodeType;
  const bNodeType = apiNodeB.renderer.nodeType;

  if (aNodeType < bNodeType) return -1;
  if (aNodeType > bNodeType) return 1;

  const aNodeName = apiNodeA.renderer.getName(apiNodeA.api);
  const bNodeName = apiNodeB.renderer.getName(apiNodeB.api);

  if (aNodeName < bNodeName) return -1;
  if (aNodeName > bNodeName) return 1;
  return 0;
}
