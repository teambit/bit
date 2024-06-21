import React from 'react';
import { APINodeRenderProps, APINodeRenderer, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { InferenceTypeSchema, ParameterSchema } from '@teambit/semantics.entities.semantic-schema';
import { TableRow } from '@teambit/documenter.ui.table-row';
import { HeadingRow } from '@teambit/documenter.ui.table-heading-row';

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
    depth = 0,
    metadata,
  } = props;
  const paramNode = api as ParameterSchema;
  const skipHeadings = metadata?.[paramNode.__schema]?.skipHeadings;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { name, type, objectBindingNodes } = paramNode;
  const typeRenderer = renderers.find((renderer) => renderer.predicate(type));
  const typeRef = type.name
    ? apiRefModel.apiByName.get(type.name) ||
      apiRefModel.apiByName.get(apiRefModel.generateInternalAPIKey(type.location.filePath, type.name))
    : undefined;
  const headings = ['name', 'type', 'default', 'description'];

  const ObjectBindingNodeComponent =
    objectBindingNodes && objectBindingNodes.length > 0 ? (
      <React.Fragment key={`${name}-param-object-binding-wrapper`}>
        {!skipHeadings && <HeadingRow className={styles.paramHeading} headings={headings} colNumber={4} />}
        {objectBindingNodes.map((_bindingNode) => {
          const typeRefCorrespondingNode = typeRef?.api.findNode((node) => {
            const matchesName = node.name === _bindingNode.name;
            const matchesAlias = (_bindingNode as any).alias && node.name === (_bindingNode as any).alias;
            return matchesName || matchesAlias;
          });
          const bindingNode = typeRefCorrespondingNode || _bindingNode;
          const bindingNodeRenderer = renderers.find((renderer) => renderer.predicate(bindingNode));

          const customBindingNodeTypeRow = (bindingNodeRenderer && (
            <bindingNodeRenderer.Component
              {...props}
              className={styles.customTypeRow}
              apiNode={{ ...props.apiNode, api: bindingNode, renderer: bindingNodeRenderer }}
              depth={(props.depth ?? 0) + 1}
              metadata={{ [_bindingNode.__schema]: { columnView: true, disableHighlight: true } }}
            />
          )) || <div className={nodeStyles.node}>{bindingNode.toString()}</div>;

          // const customBindingNodeTypeRow = <div className={nodeStyles.node}>{bindingNode.toString()}</div>;

          return (
            <TableRow
              key={`${bindingNode.name}-param`}
              headings={headings}
              colNumber={4}
              customRow={{
                type: customBindingNodeTypeRow,
              }}
              className={styles.paramRow}
              row={{
                name: bindingNode.name || '',
                description: bindingNode.doc?.comment || bindingNode.doc?.tags?.join() || '',
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

  const ParameterTypeRefRender = typeRef && renderers.find((renderer) => renderer.predicate(typeRef.api));

  const ParameterTypeComponent =
    depth < 1 && ParameterTypeRefRender ? (
      <ParameterTypeRefRender.Component
        {...props}
        // className={styles.customTypeRow}
        apiNode={{ ...props.apiNode, api: typeRef.api, renderer: ParameterTypeRefRender }}
        depth={(props.depth ?? 0) + 1}
        metadata={{ [typeRef.api.__schema]: { columnView: true } }}
      />
    ) : (
      (typeRenderer && (
        <typeRenderer.Component
          {...props}
          apiNode={{ ...props.apiNode, api: type, renderer: typeRenderer }}
          depth={(props.depth ?? 0) + 1}
          metadata={{ [type.__schema]: { columnView: true } }}
        />
      )) || <div className={nodeStyles.node}>{type.toString()}</div>
    );

  const ParameterTypeTable = () => {
    const paramTypeHeadings = ['name', 'type', 'default', 'description'];

    return (
      <React.Fragment>
        {!skipHeadings && <HeadingRow className={styles.paramHeading} headings={paramTypeHeadings} colNumber={4} />}
        <TableRow
          key={`${paramNode.name}-param`}
          className={styles.paramRow}
          headings={headings}
          colNumber={4}
          customRow={{
            type: ParameterTypeComponent,
          }}
          row={{
            name: paramNode.name || '',
            description: paramNode.doc?.comment || paramNode.doc?.tags?.join() || '',
            required: paramNode.isOptional !== undefined && !paramNode.isOptional,
            type: '',
            default: {
              value: paramNode.defaultValue || '',
            },
          }}
        />
      </React.Fragment>
    );
  };

  return <>{ObjectBindingNodeComponent || <ParameterTypeTable />}</>;
}
