import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APINode, APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { sortAPINodes } from '@teambit/api-reference.utils.sort-api-nodes';
import { Link } from '@teambit/base-react.navigation.link';

import styles from './api-reference.table-of-contents.module.scss';

export type APIReferenceTableOfContentsProps = {
  apiModel: APIReferenceModel;
} & HTMLAttributes<HTMLDivElement>;

export function APIReferenceTableOfContents({ apiModel, className }: APIReferenceTableOfContentsProps) {
  const apiNodesGroupedByType = Array.from(apiModel.apiByType.entries()).sort(sortGroupedAPINodes);
  return (
    <div className={classNames(styles.apiRefToc, className)}>
      {apiNodesGroupedByType.map(([type, nodes]) => {
        return (
          <div key={`${type}`} className={styles.apiRefTocGroup}>
            {nodes.sort(sortAPINodes).map((node) => {
              return (
                <div key={`${type}-${node.api.name}`} className={styles.apiRefTocGroupItem}>
                  <div className={styles.apiRefTocGroupIcon}>{<img src={node.renderer.icon?.url} />}</div>
                  <div className={styles.apiRefTocGroupItemName}>
                    <Link href={`~api-reference?selectedAPI=${node.api.name}`}>{node.api.name}</Link>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function sortGroupedAPINodes(a: [string, APINode<SchemaNode, false>[]], b: [string, APINode<SchemaNode, false>[]]) {
  const [aType] = a;
  const [bType] = b;

  if (aType < bType) return -1;
  if (aType > bType) return 1;

  return 0;
}
