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
  groupBy?: (nodes: SchemaNode[]) => Map<string | undefined, SchemaNode[]>;
  sort?: ([aType]: [string | undefined, SchemaNode[]], [bType]: [string | undefined, SchemaNode[]]) => 0 | 1 | -1;
} & HTMLAttributes<HTMLDivElement>;

export function SchemaNodesSummary({
  nodes,
  groupBy = groupByNodeSignatureType,
  sort = sortSignatureType,
  className,
  ...rest
}: SchemaNodesSummaryProps) {
  const hasNodes = nodes.length > 0;
  const groupedNodes = hasNodes ? Array.from(groupBy(nodes).entries()).sort(sort) : [];

  return (
    <div {...rest} className={classnames(styles.groupNodesContainer, className)}>
      {groupedNodes.map(([type, groupedMembersByType]) => {
        const typeId = type && encodeURIComponent(type);
        return (
          <div key={`${typeId}`}>
            {type && (
              <div id={typeId} className={classnames(styles.groupName, trackedElementClassName)}>
                {type}
              </div>
            )}
            {groupedMembersByType.map((member) => (
              <SchemaNodeSummary
                key={`${type}-${member.__schema}-${member.name}`}
                name={member.name}
                location={member.location}
                doc={member.doc}
                __schema={member.__schema}
                signature={member.signature}
                groupElementClassName={typeId}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
