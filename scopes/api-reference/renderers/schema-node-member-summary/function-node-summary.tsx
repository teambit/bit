import React, { HTMLAttributes, useState } from 'react';
import { SchemaNode, SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
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
  const signature =
    __schema === SetAccessorSchema.name
      ? `(${(node as SetAccessorSchema).param.toString()}) => void`
      : transformSignature(node)?.split(name)[1];

  const [, setShowSignature] = useState<boolean>(false);

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
        signature: (
          <CustomSignatureRenderer signature={signature} onClick={() => setShowSignature((value) => !value)} />
        ),
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

function CustomSignatureRenderer({
  signature,
  onClick,
}: {
  signature?: string;
  onClick: React.MouseEventHandler<HTMLDivElement>;
}) {
  return (
    <div className={styles.signatureContainer}>
      <div className={styles.signatureContent}>
        {signature}
        <div className={styles.viewSignature} onClick={onClick}>
          <div className={styles.viewSignatureText}>View Signature</div>
          <div className={styles.viewSignatureIcon}>
            <img src={'https://static.bit.dev/bit-icons/eye.svg'} />
          </div>
        </div>
      </div>
    </div>
  );
}
