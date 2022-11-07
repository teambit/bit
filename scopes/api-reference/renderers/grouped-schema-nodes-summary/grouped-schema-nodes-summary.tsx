import React, { HTMLAttributes } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import {
  FunctionNodeSummary,
  VariableNodeSummary,
  trackedElementClassName,
} from '@teambit/api-reference.renderers.schema-node-member-summary';

import classnames from 'classnames';

import styles from './grouped-schema-nodes-summary.module.scss';

export type GroupedSchemaNodesSummaryProps = {
  nodes: SchemaNode[];
  apiRefModel: APIReferenceModel;
} & HTMLAttributes<HTMLDivElement>;

export function GroupedSchemaNodesSummary({ nodes, apiRefModel, className, ...rest }: GroupedSchemaNodesSummaryProps) {
  const hasNodes = nodes.length > 0;

  const groupedNodes = hasNodes ? Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType) : [];

  return (
    <div {...rest} className={classnames(styles.groupNodesContainer, className)}>
      {groupedNodes.map(([type, groupedMembersByType], index) => {
        const typeId = type && encodeURIComponent(type);
        const headings =
          type === 'methods' || type === 'constructors'
            ? ['name', 'signature', 'description']
            : ['name', 'type', 'description'];

        return (
          <div key={`${typeId}`} className={classnames(styles.table, index !== 0 && styles.paddingTop)}>
            {type && (
              <div id={typeId} className={classnames(styles.groupName, trackedElementClassName)}>
                {type}
              </div>
            )}
            <HeadingRow className={classnames(styles.row)} colNumber={3} headings={headings} />
            {groupedMembersByType.map((member) => {
              if (type === 'methods' || type === 'constructors' || type === 'setters') {
                return (
                  <FunctionNodeSummary
                    key={`${member.__schema}-${member.name}`}
                    node={member}
                    groupElementClassName={typeId}
                    headings={headings}
                    apiRefModel={apiRefModel}
                    name={(member as any).name || 'constructor'}
                    params={(member as any).params || [(member as any).param]}
                    returnType={(member as any).returnType}
                  />
                );
              }
              return (
                <VariableNodeSummary
                  key={`${member.__schema}-${member.name}`}
                  node={member}
                  groupElementClassName={typeId}
                  headings={headings}
                  apiRefModel={apiRefModel}
                  name={(member as any).name}
                  type={(member as any).type}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
