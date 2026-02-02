import React from 'react';
import type { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { DecoratorSchema } from '@teambit/semantics.entities.semantic-schema';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';
import { TableRow } from '@teambit/documenter.ui.table-row';
import styles from './decorator.renderer.module.scss';

export const decoratorRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === DecoratorSchema.name,
  Component: DecoratorComponent,
  nodeType: 'Decorators',
  default: true,
};

function DecoratorComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
  } = props;
  const decoratorNode = api as DecoratorSchema;
  const { name, args } = decoratorNode;
  const childrenNodes = decoratorNode.args?.reduce((acc, arg) => acc.concat(arg.getNodes()), [] as any[]);

  return (
    <div className={styles.decorator}>
      <div className={styles.decoratorTitle}>@{name}</div>
      {(args?.length && (
        <GroupedSchemaNodesSummary
          headings={{
            default: ['name', 'value', 'description'],
          }}
          skipGrouping
          renderTable={(_, member: any, headings = []) => {
            return (
              <TableRow
                key={`${member.__schema}-${member.name}`}
                headings={headings}
                colNumber={headings.length as any}
                row={{
                  name: member.name || '',
                  value: member.value?.toString() || member.toString() || '',
                  description: member.doc?.comment || '',
                  type: '',
                  required: false,
                }}
              ></TableRow>
            );
          }}
          nodes={childrenNodes ?? []}
          apiNodeRendererProps={props}
        />
      )) ||
        null}
    </div>
  );
}
