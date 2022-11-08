/* eslint-disable @typescript-eslint/no-unused-vars */
import React from 'react';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';
import classnames from 'classnames';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { Link } from '@teambit/base-react.navigation.link';

import styles from './type-ref.renderer.module.scss';

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
  } = props;
  const typeRefNode = api as TypeRefSchema;

  if (depth === 0) {
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

  const exportedTypeFromSameComp = typeRefNode.isFromThisComponent()
    ? apiRefModel.apiByName.get(typeRefNode.name)
    : undefined;

  const exportedTypeUrlFromSameComp =
    exportedTypeFromSameComp &&
    useUpdatedUrlFromQuery({
      selectedAPI: exportedTypeFromSameComp.api.name,
    });

  const exportedTypeUrlFromAnotherComp = typeRefNode.componentId
    ? getExportedTypeUrlFromAnotherComp({
        componentId: typeRefNode.componentId,
        selectedAPI: typeRefNode.name,
      })
    : undefined;

  const args =
    typeRefNode.typeArgs?.map((typeArg, index, typeArgs) => {
      const typeArgRenderer = renderers.find((renderer) => renderer.predicate(typeArg));

      if (typeArgRenderer) {
        return (
          <React.Fragment key={`type-arg-container-${typeArg.__schema}-${typeArg.toString()}-${index}`}>
            <typeArgRenderer.Component
              {...props}
              key={`type-arg-${typeArg.__schema}-${typeArg.toString()}-${index}`}
              apiNode={{ ...props.apiNode, api: typeArg, renderer: typeArgRenderer }}
              depth={(props.depth ?? 0) + 1}
              metadata={{ [typeArg.__schema]: { columnView: true } }}
            />
            {(typeArgs?.length ?? 0) > 1 && index !== (typeArgs?.length ?? 0) - 1 ? ', ' : null}
          </React.Fragment>
        );
      }

      return (
        <React.Fragment key={typeArg.toString()}>
          {typeArg.toString()}
          {(typeArgs?.length ?? 0) > 1 && index !== (typeArgs?.length ?? 0) - 1 ? ', ' : null}
        </React.Fragment>
      );
    }) ?? null;

  if (args) {
    return (
      <React.Fragment key={`typeRef-with-args-container-${typeRefNode.name}`}>
        <TypeRefName
          key={`typeRef-with-args-${typeRefNode.name}`}
          name={typeRefNode.name}
          external={!!exportedTypeUrlFromAnotherComp}
          url={exportedTypeUrlFromSameComp || exportedTypeUrlFromAnotherComp}
        />
        <div key={`typeArgsContainer-${typeRefNode.name}`} className={classnames(styles.node)}>
          {'<'}
          {args.map((arg) => arg)}
          {'>'}
        </div>
      </React.Fragment>
    );
  }

  return (
    <TypeRefName
      key={`typeRef-${typeRefNode.name}`}
      name={typeRefNode.name}
      external={!!exportedTypeUrlFromAnotherComp}
      url={exportedTypeUrlFromSameComp || exportedTypeUrlFromAnotherComp}
    />
  );
}

function TypeRefName({ name, url, external }: { name: string; url?: string; external?: boolean }) {
  if (url) {
    return (
      <Link href={url} external={external} className={classnames(styles.node, styles.nodeLink)}>
        {name}
      </Link>
    );
  }
  return <div className={classnames(styles.node)}>{name}</div>;
}

function getExportedTypeUrlFromAnotherComp({
  componentId,
  selectedAPI,
}: {
  componentId: ComponentID;
  selectedAPI: string;
}) {
  const componentUrl = ComponentUrl.toUrl(componentId);
  const [componentIdUrl, versionQuery] = componentUrl.split('?');

  const exportedTypeUrl = `${componentIdUrl}/~api-reference?selectedAPI=${encodeURIComponent(
    selectedAPI
  )}&${versionQuery}`;

  return exportedTypeUrl;
}
