import React, { HTMLAttributes } from 'react';
import { SchemaNode } from '@teambit/semantics.entities.semantic-schema';
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
  const typeRenderer = type && renderers.find((renderer) => renderer.predicate(type));

  const customTypeRow = (typeRenderer && (
    <typeRenderer.Component
      {...apiNodeRendererProps}
      apiNode={{ ...apiNodeRendererProps.apiNode, api: type, renderer: typeRenderer }}
      depth={(apiNodeRendererProps.depth ?? 0) + 1}
      metadata={{ [type.__schema]: { columnView: true } }}
    />
  )) || <div className={classnames(nodeStyles.node, styles.codeSnippet)}>{type?.toString()}</div>;

  return (
    <TableRow
      {...rest}
      key={`${__schema}-${name}`}
      className={classnames(className, styles.row)}
      headings={headings}
      colNumber={headings.length as any}
      customRow={{
        name: (
          <div id={name} className={classnames(trackedElementClassName, groupElementClassName, styles.name)}>
            {name}
          </div>
        ),
        type: customTypeRow,
      }}
      row={{
        name,
        description: doc?.comment || '',
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
