import React, { HTMLAttributes, useState } from 'react';
import { SchemaNode, SetAccessorSchema } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';
import { transformSignature } from '@teambit/api-reference.utils.schema-node-signature-transform';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';
import { APINodeRenderProps } from '@teambit/api-reference.models.api-node-renderer';
import classnames from 'classnames';
import { parameterRenderer as defaultParamRenderer } from '@teambit/api-reference.renderers.parameter';
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
  apiNodeRendererProps: APINodeRenderProps;
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
  params,
  returnType,
  apiNodeRendererProps,
  ...rest
}: FunctionNodeSummaryProps) {
  const { __schema, doc } = node;
  const signature =
    __schema === SetAccessorSchema.name
      ? `(${(node as SetAccessorSchema).param.toString()}) => void`
      : transformSignature(node)?.split(name)[1];

  const [showSignature, setShowSignature] = useState<boolean>(false);

  const row = (
    <TableRow
      {...rest}
      key={`${__schema}-${name}`}
      className={classnames(className, styles.row, showSignature && styles.showSignature)}
      headings={headings}
      colNumber={3}
      customRow={{
        name: (
          <div id={name} className={classnames(trackedElementClassName, groupElementClassName, styles.name)}>
            {name}
          </div>
        ),
        signature: (
          <CustomSignatureRenderer
            signature={signature}
            onClick={() => setShowSignature((value) => !value)}
            showSignature={showSignature}
          />
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

  if (!showSignature) return row;

  const { renderers } = apiNodeRendererProps;
  const returnTypeRenderer = returnType && renderers.find((renderer) => renderer.predicate(returnType));

  return (
    <div className={styles.rowWithSignatureDetails}>
      {row}
      <div className={styles.signatureDetails}>
        {params.length > 0 && (
          <div className={styles.paramsContainer}>
            <HeadingRow colNumber={4} headings={['name', 'type', 'default', 'description']} />
            {params.map((param) => {
              const paramRenderer = renderers.find((renderer) => renderer.predicate(param));
              if (paramRenderer?.Component) {
                return (
                  <paramRenderer.Component
                    {...apiNodeRendererProps}
                    key={`param-${param.name}`}
                    depth={(apiNodeRendererProps.depth ?? 0) + 1}
                    apiNode={{ ...apiNodeRendererProps.apiNode, renderer: paramRenderer, api: param }}
                    metadata={{ [param.__schema]: { columnView: true } }}
                  />
                );
              }
              return (
                <defaultParamRenderer.Component
                  {...apiNodeRendererProps}
                  key={`param-${param.name}`}
                  depth={(apiNodeRendererProps.depth ?? 0) + 1}
                  apiNode={{ ...apiNodeRendererProps.apiNode, renderer: defaultParamRenderer, api: param }}
                  metadata={{ [param.__schema]: { columnView: true } }}
                />
              );
            })}
          </div>
        )}
        {returnType && (
          <div className={styles.returnContainer}>
            <div className={styles.returnTitle}>Returns</div>
            <div className={styles.returnType}>
              {(returnTypeRenderer && (
                <returnTypeRenderer.Component
                  {...apiNodeRendererProps}
                  apiNode={{ ...apiNodeRendererProps.apiNode, api: returnType, renderer: returnTypeRenderer }}
                  depth={(apiNodeRendererProps.depth ?? 0) + 1}
                />
              )) || <div className={styles.node}>{returnType.toString()}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomSignatureRenderer({
  signature,
  onClick,
  showSignature,
}: {
  signature?: string;
  onClick: React.MouseEventHandler<HTMLDivElement>;
  showSignature: boolean;
}) {
  const [isHovering, setIsHovering] = useState<boolean>(false);

  return (
    <div
      className={styles.signatureContainer}
      onMouseOver={() => setIsHovering(true)}
      onMouseOut={() => setIsHovering(false)}
    >
      <div className={classnames(styles.signatureContent, (isHovering || showSignature) && styles.isHovering)}>
        {signature}
        <div
          className={classnames(styles.viewSignature, (isHovering || showSignature) && styles.isVisible)}
          onClick={onClick}
        >
          <div className={styles.viewSignatureText}>{!showSignature ? 'View Signature' : 'Close'}</div>
          <div className={styles.viewSignatureIcon}>
            {!showSignature && <img src={'https://static.bit.dev/bit-icons/eye.svg'} />}
            {showSignature && <img src={'https://static.bit.dev/bit-icons/close-x.svg'} />}
          </div>
        </div>
      </div>
    </div>
  );
}
