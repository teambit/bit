import React from 'react';
import {
  InferenceTypeSchema,
  SchemaNode,
  TypeIntersectionSchema,
  TypeRefSchema,
  TypeSchema,
  TypeUnionSchema,
} from '@teambit/semantics.entities.semantic-schema';
import classnames from 'classnames';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';
import { APIReferenceModel } from '@teambit/api-reference.models.api-reference-model';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { Link } from '@teambit/base-react.navigation.link';

import styles from './type-info-from-schema-node.module.scss';

export type TypeInfoFromSchemaNodeProps = {
  node: SchemaNode;
  apiRefModel: APIReferenceModel;
};

export function TypeInfoFromSchemaNode({ node, apiRefModel }: TypeInfoFromSchemaNodeProps) {
  if (node instanceof TypeSchema) {
    return (
      <div className={classnames(styles.node)}>
        <TypeInfoFromSchemaNode node={node.type} apiRefModel={apiRefModel} />
      </div>
    );
  }

  if (node instanceof InferenceTypeSchema) {
    const inferenceTypeNode = node as InferenceTypeSchema;
    return (
      <div key={`inference-${inferenceTypeNode.name}`} className={classnames(styles.node)}>
        {inferenceTypeNode.type}
      </div>
    );
  }

  if (node instanceof TypeRefSchema) {
    const typeRefNode = node as TypeRefSchema;
    const exportedTypeFromSameComp = typeRefNode.isFromThisComponent()
      ? apiRefModel.apiByName.get(typeRefNode.name)
      : undefined;

    const exportedTypeUrlFromSameComp =
      exportedTypeFromSameComp &&
      useUpdatedUrlFromQuery({
        selectedAPI: `${exportedTypeFromSameComp.renderer.nodeType}/${exportedTypeFromSameComp.api.name}`,
      });

    const exportedTypeUrlFromAnotherComp = typeRefNode.componentId
      ? getExportedTypeUrlFromAnotherComp({
          componentId: typeRefNode.componentId,
          selectedAPI: typeRefNode.name,
        })
      : undefined;

    const args =
      typeRefNode.typeArgs?.map((typeArg, index, typeArgs) => {
        return (
          <>
            <TypeInfoFromSchemaNode key={`typeRef-${typeArg.name}-${index}`} node={typeArg} apiRefModel={apiRefModel} />
            {(typeArgs?.length ?? 0) > 1 && index !== (typeArgs?.length ?? 0) - 1 ? ', ' : null}
          </>
        );
      }) ?? null;

    if (args) {
      return (
        <>
          <TypeRefName
            key={`typeRef-${typeRefNode.name}`}
            name={typeRefNode.name}
            external={!!exportedTypeUrlFromAnotherComp}
            url={exportedTypeUrlFromSameComp || exportedTypeUrlFromAnotherComp}
          />
          <div className={classnames(styles.node)}>
            {'<'}
            {args.map((arg) => arg)}
            {'>'}
          </div>
        </>
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

  if (node instanceof TypeUnionSchema || node instanceof TypeIntersectionSchema) {
    const typeUnionOrIntersectionNode = node as TypeUnionSchema | TypeIntersectionSchema;
    const separator = node instanceof TypeUnionSchema ? ' | ' : ' & ';

    return (
      <div className={classnames(styles.node)}>
        {typeUnionOrIntersectionNode.types.map((type, index) => {
          return (
            <>
              <TypeInfoFromSchemaNode key={`${type.name}-${index}`} node={type} apiRefModel={apiRefModel} />
              {typeUnionOrIntersectionNode.types.length > 1 &&
              index !== typeUnionOrIntersectionNode.types.length - 1 ? (
                <div key={`${type.name}-${index}-${separator}`} className={classnames(styles.node, styles.padding2)}>
                  {separator}
                </div>
              ) : null}
            </>
          );
        })}
      </div>
    );
  }

  return (
    <div key={node.toString()} className={classnames(styles.node)}>
      {node.toString()}
    </div>
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
