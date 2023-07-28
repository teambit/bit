import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema, ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
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
    apiRefModel,
    renderers,
  } = props;

  const paramNode = api as ParameterSchema;

  const { name, isOptional, doc, type, defaultValue, objectBindingNodes } = paramNode;
  const typeRenderer = renderers.find((renderer) => renderer.predicate(type));
  const typeRef = type.name ? apiRefModel.apiByName.get(type.name) : undefined;
  console.log('🚀 ~ file: parameter.renderer.tsx:27 ~ typeRef:', typeRef);

  const ObjectBindingNodeComponent =
    objectBindingNodes && objectBindingNodes.length > 0 ? (
      <React.Fragment key={`${name}-param`}>
        {objectBindingNodes.map((_bindingNode) => {
          const typeRefCorrespondingNode = typeRef?.api.findNode((node) => node.name === _bindingNode.name);
          const bindingNode = typeRefCorrespondingNode || _bindingNode;
          const bindingNodeRenderer = renderers.find((renderer) => renderer.predicate(bindingNode));

          const customBindingNodeTypeRow = (bindingNodeRenderer && (
            <bindingNodeRenderer.Component
              {...props}
              className={styles.customTypeRow}
              apiNode={{ ...props.apiNode, api: bindingNode, renderer: bindingNodeRenderer }}
              depth={(props.depth ?? 0) + 1}
              metadata={{ [_bindingNode.__schema]: { columnView: true } }}
            />
          )) || <div className={styles.node}>{bindingNode.toString()}</div>;

          console.log(
            '🚀 ~ file: parameter.renderer.tsx:54 ~ {objectBindingNodes.map ~ typeRefCorrespondingNode:',
            typeRefCorrespondingNode
          );

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
                required:
                  (typeRefCorrespondingNode as any)?.isOptional !== undefined &&
                  !(typeRefCorrespondingNode as any)?.isOptional,
                type: '',
                // infer defaultValue
                default: {
                  value: (_bindingNode as InferenceTypeSchema).defaultValue || '',
                },
              }}
            />
          );
        })}
      </React.Fragment>
    ) : null;

  const ParameterTypeRender = typeRef && renderers.find((renderer) => renderer.predicate(typeRef.api));
  console.log(
    '🚀 ~ file: parameter.renderer.tsx:88 ~ {objectBindingNodes.map ~ ParameterTypeRender:',
    ParameterTypeRender
  );
  const ParameterTypeComponent = ParameterTypeRender && (
    <ParameterTypeRender.Component
      {...props}
      // className={styles.customTypeRow}
      apiNode={{ ...props.apiNode, api: typeRef.api, renderer: ParameterTypeRender }}
      depth={(props.depth ?? 0) + 1}
      metadata={{ [typeRef.api.__schema]: { columnView: true } }}
    />
  );

  return (
    <>
      {ParameterTypeComponent}
      {ObjectBindingNodeComponent}
    </>
  );
}
