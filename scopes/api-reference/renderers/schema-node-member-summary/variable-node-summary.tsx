import React, { HTMLAttributes } from 'react';
import { IndexSignatureSchema, SchemaNode } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';
import classnames from 'classnames';
import { APINodeRenderProps, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { trackedElementClassName } from './index';

import styles from './variable-node-summary.module.scss';

export type VariableNodeSummaryProps = {
  groupElementClassName?: string;
  node: SchemaNode;
  headings: string[];
  name: string;
  type?: SchemaNode;
  isOptional?: boolean;
  apiNodeRendererProps: APINodeRenderProps;
  defaultValue?: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * @todo handle doc.tags
 */
export function VariableNodeSummary({
  groupElementClassName,
  className,
  headings,
  node,
  name,
  isOptional,
  type,
  apiNodeRendererProps,
  defaultValue,
  ...rest
}: VariableNodeSummaryProps) {
  const { __schema, doc } = node;
  const { renderers } = apiNodeRendererProps;
  const sanitizedName = __schema === 'IndexSignatureSchema' ? (node as IndexSignatureSchema).keyType.toString() : name;
  const sanitizedType = __schema === 'IndexSignatureSchema' ? (node as IndexSignatureSchema).valueType : type;
  const typeRenderer = sanitizedType && renderers.find((renderer) => renderer.predicate(sanitizedType));

  const customTypeRow = (typeRenderer && (
    <typeRenderer.Component
      {...apiNodeRendererProps}
      apiNode={{ ...apiNodeRendererProps.apiNode, api: sanitizedType, renderer: typeRenderer }}
      depth={(apiNodeRendererProps.depth ?? 0) + 1}
      metadata={{ [sanitizedType.__schema]: { columnView: true } }}
    />
  )) || <div className={classnames(nodeStyles.node, styles.codeSnippet)}>{type?.toString()}</div>;

  return (
    <TableRow
      key={`${__schema}-${name}`}
      {...rest}
      className={classnames(className, styles.row)}
      headings={headings}
      colNumber={headings.length as any}
      customRow={{
        name: (
          <div id={sanitizedName} className={classnames(trackedElementClassName, groupElementClassName, styles.name)}>
            {sanitizedName}
          </div>
        ),
        type: customTypeRow,
      }}
      row={{
        name: sanitizedName,
        description: doc?.comment || doc?.tags?.join() || '',
        required: isOptional !== undefined && !isOptional,
        type: '',
        default:
          (defaultValue && {
            value: defaultValue,
          }) ||
          undefined,
      }}
    />
  );
}
