import type { HTMLAttributes } from 'react';
import React from 'react';
import classNames from 'classnames';
import type { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import type { APINode, APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
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
      {apiNodesGroupedByType.map(([type, nodes]) => (
        <div key={type} className={styles.apiRefTocGroupC}>
          <div key={type} className={styles.apiRefTocGroupNameContainer}>
            <h3 className={styles.apiRefTocGroupName}>
              <img className={styles.apiRefTocGroupIcon} src={nodes[0]?.renderer?.icon?.url} alt={`${type} icon`} />
              <span>{nodes[0]?.renderer?.nodeType}</span>
            </h3>
          </div>
          <div key={type} className={styles.apiRefTocGroup}>
            {nodes.sort(sortAPINodes).map((node) => (
              <div key={node.alias || node.api.name} className={styles.apiRefTocGroupItem}>
                <div className={styles.apiRefTocGroupItemName}>
                  <Link
                    className={styles.apiRefTocLink}
                    href={`~api-reference?selectedAPI=${node.alias || node.api.name}`}
                  >
                    {node.alias || node.api.name}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function sortGroupedAPINodes(a: [string, APINode<SchemaNode>[]], b: [string, APINode<SchemaNode>[]]) {
  const [aType] = a;
  const [bType] = b;
  return aType.localeCompare(bType);
}
