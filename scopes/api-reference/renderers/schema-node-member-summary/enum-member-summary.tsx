import React, { HTMLAttributes } from 'react';
import { EnumMemberSchema } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';
import classnames from 'classnames';
import { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import { transformSignature } from '@teambit/api-reference.utils.schema-node-signature-transform';
import { trackedElementClassName } from './index';

import styles from './enum-member-summary.module.scss';

export type EnumMemberSummaryProps = {
  groupElementClassName?: string;
  node: EnumMemberSchema;
  headings: string[];
  name: string;
  apiNodeRendererProps: APINodeRenderProps;
} & HTMLAttributes<HTMLDivElement>;

/**
 * @todo handle doc.tags
 */
export function EnumMemberSummary({
  groupElementClassName,
  className,
  headings,
  node,
  name,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  apiNodeRendererProps,
  ...rest
}: EnumMemberSummaryProps) {
  const { __schema, doc } = node;
  const signature = transformSignature(node);

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
        signature: <div className={styles.signature}>{signature}</div>,
      }}
      row={{
        name,
        description: doc?.comment || '',
        required: false,
        type: '',
      }}
    />
  );
}
