import React, { HTMLAttributes } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';
import classnames from 'classnames';
import { SchemaNodeSummary, trackedElementClassName } from '@teambit/api-reference.renderers.schema-node-summary';

import styles from './schema-nodes-summary.module.scss';

export type SchemaNodesSummaryProps = {
  nodes: SchemaNode[];
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodesSummary({ nodes, className, ...rest }: SchemaNodesSummaryProps) {
  const hasNodes = nodes.length > 0;
  const groupedNodes = hasNodes ? Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType) : [];

  return (
    <div {...rest} className={classnames(styles.groupNodesContainer, className)}>
      {groupedNodes.map(([type, groupedMembersByType]) => {
        return (
          <div key={`${type}`}>
            <div id={type} className={classnames(styles.groupName, trackedElementClassName)}>
              {type}
            </div>
            {groupedMembersByType.map((member) => (
              <SchemaNodeSummary
                key={`${type}-${member.__schema}-${member.name}`}
                node={member}
                groupElementClassName={type}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
