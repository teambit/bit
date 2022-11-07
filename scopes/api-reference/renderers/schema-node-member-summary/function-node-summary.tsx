import React, { HTMLAttributes } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';
import { transformSignature } from '@teambit/api-reference.utils.schema-node-signature-transform';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import classnames from 'classnames';
import { trackedElementClassName } from './index';

import styles from './function-node-summary.module.scss';

export type FunctionNodeSummaryProps = {
  groupElementClassName?: string;
  node: SchemaNode;
  name: string;
  headings: string[];
  apiRefModel: APIReferenceModel;
  returnType?: SchemaNode;
  params: SchemaNode[];
} & HTMLAttributes<HTMLDivElement>;

/**
 * @todo handle doc.tags
 */
export function FunctionNodeSummary({
  groupElementClassName,
  className,
  headings,
  node,
  name,
  ...rest
}: FunctionNodeSummaryProps) {
  const { __schema, doc } = node;
  const signature = transformSignature(node)?.split(name)[1];

  return (
    <TableRow
      {...rest}
      key={`${__schema}-${name}`}
      className={classnames(className, styles.row)}
      headings={headings}
      colNumber={3}
      customRow={{
        name: (
          <div id={name} className={classnames(trackedElementClassName, groupElementClassName)}>
            {name}
          </div>
        ),
        signature: <div className={styles.signature}>{signature}</div>,
      }}
      row={{
        name,
        description: doc?.comment || '',
        parameter: '',
        required: false,
        type: '',
        signature,
      }}
    />
  );
}
