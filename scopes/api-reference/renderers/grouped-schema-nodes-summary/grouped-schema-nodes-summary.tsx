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
  headings?: Record<string, string[]>;
  skipGrouping?: boolean;
  skipNode?(type: string, members: SchemaNode[]): boolean;
  renderTable?(type: string, member: SchemaNode, headings?: string[]): React.ReactNode;
} & HTMLAttributes<HTMLDivElement>;

const DEFAULT_HEADINGS = {
  methods: ['name', 'signature', 'description'],
  constructors: ['name', 'signature', 'description'],
  'enum members': ['name', 'description'],
  properties: ['name', 'type', 'default', 'description'],
  setters: ['name', 'signature', 'description'],
  default: ['name', 'type', 'description'],
};

const defaultTableRenderer = function DefaultTableRendererWrapper(apiNodeRendererProps: APINodeRenderProps) {
  return function DefaultTableRenderer(type: string, member: SchemaNode, headings: string[]) {
    const typeId = type && encodeURIComponent(type);

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
      <VariableNodeSummary
        key={`${member.__schema}-${member.name}`}
        node={member}
        headings={headings}
        groupElementClassName={typeId}
        apiNodeRendererProps={apiNodeRendererProps}
        name={member.name || member.signature || ''}
        type={(member as any).type}
        isOptional={(member as any).isOptional}
        defaultValue={(member as any).defaultValue}
      />
    );
  };
};

export function GroupedSchemaNodesSummary({
  nodes,
  apiNodeRendererProps,
  headings: headingsFromProps = {},
  skipNode,
  skipGrouping,
  renderTable = defaultTableRenderer(apiNodeRendererProps),
  className,
  ...rest
}: GroupedSchemaNodesSummaryProps) {
  const hasNodes = nodes.length > 0;
  const headings = {
    ...DEFAULT_HEADINGS,
    ...headingsFromProps,
  };

  const groupedNodes =
    !skipGrouping && hasNodes
      ? Array.from(groupByNodeSignatureType(nodes).entries()).sort(sortSignatureType)
      : (hasNodes && [['', nodes] as [string, SchemaNode[]]]) || [];

  const { apiRefModel } = apiNodeRendererProps;

  return (
    <div {...rest} className={classnames(styles.groupNodesContainer, className)}>
      {groupedNodes.map(([type, groupedMembersByType], index) => {
        const skip = skipNode && type && skipNode(type, groupedMembersByType);
        const skipRenderingTable = type === 'methods' || type === 'constructors' || type === 'setters';
        const typeId = type && encodeURIComponent(type);
        const _headings = (type && headings[type]) || headings.default;

        if (skip) return null;

        return (
          <div key={`${typeId}`} className={classnames(index !== 0 && styles.paddingTop)}>
            {type && (
              <div id={typeId} className={classnames(styles.groupName, trackedElementClassName)}>
                {type}
              </div>
            )}
            {!skipRenderingTable && (
              <div className={styles.table}>
                <HeadingRow
                  className={classnames(styles.row, styles.headingRow)}
                  colNumber={_headings.length as any}
                  headings={_headings}
                />
                {groupedMembersByType.map((member) => {
                  return renderTable(type ?? '', member, _headings);
                })}
              </div>
            )}
            {skipRenderingTable &&
              groupedMembersByType.map((member) => {
                if (!type) return null;
                const params =
                  (member as any).params ||
                  (member as any).props ||
                  ((member as any).param && [(member as any).param]) ||
                  [];

                return (
                  <FunctionNodeSummary
                    key={`${member.__schema}-${member.name}`}
                    node={member}
                    apiNodeRendererProps={apiNodeRendererProps}
                    groupElementClassName={typeId}
                    headings={_headings}
                    apiRefModel={apiRefModel}
                    name={(member as any).name}
                    hideName={type === 'constructors'}
                    params={params}
                    returnType={(member as any).returnType}
                  />
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
