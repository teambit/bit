/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { ComponentID } from '@teambit/component-id';

export const typeRefRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeRefSchema.name,
  Component: TypeRefComponent,
  nodeType: 'TypeRefs',
  icon: { name: 'TypeRef', url: 'https://static.bit.dev/api-reference/type.svg' },
  default: true,
};

/**
 * @todo figure out how to render deeply nested typeArgs
 */
function TypeRefComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    apiRefModel,
    depth,
    renderers,
    ...rest
  } = props;
  const typeRefNode = api as TypeRefSchema;

  if (props.depth === 0) {
    return (
      <APINodeDetails
        {...props}
        apiNode={{
          ...props.apiNode,
          api: copySchemaNode(typeRefNode, { signature: typeRefNode.signature || typeRefNode.toString() }),
        }}
      />
    );
  }

  const exportedTypeFromSameComp = apiRefModel.apiByName.get(typeRefNode.name);
  const exportedTypeUrlFromSameComp =
    exportedTypeFromSameComp &&
    useUpdatedUrlFromQuery({
      selectedAPI: `${exportedTypeFromSameComp.renderer.nodeType}/${exportedTypeFromSameComp.api.name}`,
    });

  // const exportedTypeUrlFromAnotherComp = typeRefNode.componentId
  //   ? getExportedTypeUrlFromAnotherComp({
  //       componentId: typeRefNode.componentId,
  //       selectedAPI: `${typeRefRenderer.nodeType}/${typeRefNode.name}`,
  //     })
  //   : undefined;
  // console.log(
  //   '🚀 ~ file: type-ref.renderer.tsx ~ line 55 ~ TypeRefComponent ~ exportedTypeUrlFromAnotherComp',
  //   exportedTypeUrlFromAnotherComp
  // );

  if (exportedTypeUrlFromSameComp) {
    return (
      <a className={rest.className} href={exportedTypeUrlFromSameComp}>
        {exportedTypeFromSameComp.api.name}
      </a>
    );
  }

  return <div {...rest}>{typeRefNode.toString()}</div>;
}
