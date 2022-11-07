import React, { HTMLAttributes } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { TypeInfoFromSchemaNode } from '@teambit/api-reference.utils.type-info-from-schema-node';
import { TableRow } from '@teambit/documenter.ui.table-row';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import classnames from 'classnames';
import { trackedElementClassName } from './index';

import styles from './variable-node-summary.module.scss';

export type VariableNodeSummaryProps = {
  groupElementClassName?: string;
  node: SchemaNode;
  headings: string[];
  apiRefModel: APIReferenceModel;
  name: string;
  type: SchemaNode;
  isOptional?: boolean;
} & HTMLAttributes<HTMLDivElement>;

/**
 * @todo handle doc.tags
 */
export function VariableNodeSummary({
  groupElementClassName,
  className,
  headings,
  apiRefModel,
  node,
  name,
  isOptional,
  type,
  ...rest
}: VariableNodeSummaryProps) {
  const { __schema, doc } = node;

  return (
    <TableRow
      {...rest}
      key={`${__schema}-${name}`}
      className={classnames(className, styles.row)}
      headings={headings}
      colNumber={3}
      customRow={{
        name: (
          <div id={name} className={classnames(trackedElementClassName, groupElementClassName, styles.name)}>
            {name}
          </div>
        ),
        type: (
          <TypeInfoFromSchemaNode
            key={`typeinfo-${__schema}-${node.toString()}`}
            node={type}
            apiRefModel={apiRefModel}
          />
        ),
      }}
      row={{
        name,
        description: doc?.comment || '',
        required: !isOptional,
        type: '',
      }}
    />
  );
}
