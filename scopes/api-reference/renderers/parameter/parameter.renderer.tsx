import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';

import styles from './parameter.renderer.module.scss';

export const parameterRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ParameterSchema.name,
  Component: ParameterComponent,
  nodeType: 'Parameters',
  default: true,
};

function ParameterComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    renderers,
  } = props;

  const paramNode = api as ParameterSchema;
  const { name, isOptional, doc, type, defaultValue, objectBindingNodes } = paramNode;
  const typeRenderer = renderers.find((renderer) => renderer.predicate(type));
  const customTypeRow = (typeRenderer && (
    <typeRenderer.Component
      {...props}
      apiNode={{ ...props.apiNode, api: type, renderer: typeRenderer }}
      depth={(props.depth ?? 0) + 1}
      metadata={{ [type.__schema]: { columnView: true } }}
    />
  )) || <div className={styles.node}>{type.toString()}</div>;

  if (objectBindingNodes) {
    return (
      <React.Fragment key={`${name}-param`}>
        {objectBindingNodes.map((bindingNode) => {
          const bindingNodeRenderer = renderers.find((renderer) => renderer.predicate(bindingNode));
          const customBindingNodeTypeRow = (bindingNodeRenderer && (
            <bindingNodeRenderer.Component
              {...props}
              apiNode={{ ...props.apiNode, api: bindingNode, renderer: bindingNodeRenderer }}
              depth={(props.depth ?? 0) + 1}
              metadata={{ [type.__schema]: { columnView: true } }}
            />
          )) || <div className={styles.node}>{bindingNode.toString()}</div>;

          return (
            <TableRow
              key={`${bindingNode.name}-param`}
              headings={['name', 'type', 'default', 'description']}
              colNumber={4}
              customRow={{
                type: customBindingNodeTypeRow,
              }}
              row={{
                name: bindingNode.name || '',
                description: bindingNode.doc?.comment || '',
                required: false, // currently we don't have this information
                type: '',
              }}
            />
          );
        })}
      </React.Fragment>
    );
  }

  return (
    <TableRow
      key={`${name}-param`}
      headings={['name', 'type', 'default', 'description']}
      colNumber={4}
      customRow={{
        type: customTypeRow,
      }}
      row={{
        name,
        description: doc?.comment || '',
        required: !isOptional,
        type: '',
        default: { value: defaultValue },
      }}
    />
  );
}
