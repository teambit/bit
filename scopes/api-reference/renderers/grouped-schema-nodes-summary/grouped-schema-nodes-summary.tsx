import React, { HTMLAttributes } from 'react';
import { SchemaNode, EnumMemberSchema } from '@teambit/semantics.entities.semantic-schema';
import {
  groupByNodeSignatureType,
  sortSignatureType,
} from '@teambit/api-reference.utils.group-schema-node-by-signature';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
import { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import {
  FunctionNodeSummary,
  VariableNodeSummary,
  trackedElementClassName,
  EnumMemberSummary,
} from '@teambit/api-reference.renderers.schema-node-member-summary';
import classnames from 'classnames';

import styles from './grouped-schema-nodes-summary.module.scss';

export type GroupedSchemaNodesSummaryProps = {
  nodes: SchemaNode[];
  apiNodeRendererProps: APINodeRenderProps;
} & HTMLAttributes<HTMLDivElement>;

export function GroupedSchemaNodesSummary({
  nodes,
  apiNodeRendererProps,
  className,
  ...rest
}: GroupedSchemaNodesSummaryProps) {
  const hasNodes = nodes.length > 0;

  const groupedNodes = hasNodes ? Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType) : [];
  const { apiRefModel } = apiNodeRendererProps;
  return (
    <div {...rest} className={classnames(styles.groupNodesContainer, className)}>
      {groupedNodes.map(([type, groupedMembersByType], index) => {
        const typeId = type && encodeURIComponent(type);
        const headings =
          type === 'methods' || type === 'constructors' || type === 'enum members' || type === 'setters'
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
                    apiNodeRendererProps={apiNodeRendererProps}
                    groupElementClassName={typeId}
                    headings={headings}
                    apiRefModel={apiRefModel}
                    name={(member as any).name || 'constructor'}
                    params={(member as any).params || [(member as any).param]}
                    returnType={(member as any).returnType}
                  />
                );
              }
              if (type === 'enum members') {
                return (
                  <EnumMemberSummary
                    key={`${member.__schema}-${member.name}`}
                    headings={headings}
                    apiNodeRendererProps={apiNodeRendererProps}
                    groupElementClassName={typeId}
                    name={(member as EnumMemberSchema).name}
                    node={member as EnumMemberSchema}
                  />
                );
              }

              return (
                // @todo refactor this the member type should not be any
                <VariableNodeSummary
                  key={`${member.__schema}-${member.name}`}
                  node={member}
                  headings={headings}
                  groupElementClassName={typeId}
                  apiNodeRendererProps={apiNodeRendererProps}
                  name={(member as any).name}
                  type={(member as any).type}
                  isOptional={(member as any).isOptional}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
