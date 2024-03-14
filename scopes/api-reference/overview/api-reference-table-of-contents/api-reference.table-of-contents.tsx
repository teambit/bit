import React, { HTMLAttributes } from 'react';
import classNames from 'classnames';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { APINode, APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { sortAPINodes } from '@teambit/api-reference.utils.sort-api-nodes';
import { Link as BaseLink } from '@teambit/base-react.navigation.link';

import styles from './api-reference.table-of-contents.module.scss';

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

export type APIReferenceTableOfContentsProps = {
  apiModel: APIReferenceModel;
} & HTMLAttributes<HTMLDivElement>;

export function APIReferenceTableOfContents({ apiModel, className }: APIReferenceTableOfContentsProps) {
  const apiNodesGroupedByType = Array.from(apiModel.apiByType.entries()).sort(sortGroupedAPINodes);

  return (
    <div className={classNames(styles.apiRefToc, className)}>
      {apiNodesGroupedByType.map(([type, nodes]) => {
        const chunkedNodes = chunkArray(nodes.sort(sortAPINodes), 3);
        return chunkedNodes.map((nodeGroup, groupIndex) => (
          <div
            key={`${type}-${groupIndex}`}
            className={classNames(styles.apiRefTocGroup, { [styles.extraPadding]: groupIndex !== 0 })}
          >
            {nodeGroup.map((node) => (
              <div key={`${type}-${node.api.name}`} className={styles.apiRefTocGroupItem}>
                <div className={styles.apiRefTocGroupIcon}>{<img src={node.renderer.icon?.url} />}</div>
                <div className={styles.apiRefTocGroupItemName}>
                  <Link href={`~api-reference?selectedAPI=${node.api.name}`}>{node.api.name}</Link>
                </div>
              </div>
            ))}
          </div>
        ));
      })}
    </div>
  );
}

function sortGroupedAPINodes(a: [string, APINode<SchemaNode>[]], b: [string, APINode<SchemaNode>[]]) {
  const [aType] = a;
  const [bType] = b;

  if (aType < bType) return -1;
  if (aType > bType) return 1;

  return 0;
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunkedArr: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunkedArr.push(array.slice(i, i + size));
  }
  return chunkedArr;
}
