import React from 'react';
import { APINodeRenderProps, APINodeRenderer, nodeStyles } from '@teambit/api-reference.models.api-node-renderer';
import { TypeRefSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { copySchemaNode } from '@teambit/api-reference.utils.copy-schema-node';
import classnames from 'classnames';
import { useUpdatedUrlFromQuery } from '@teambit/api-reference.hooks.use-api-ref-url';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { Link as BaseLink } from '@teambit/base-react.navigation.link';

import styles from './type-ref.renderer.module.scss';

// @todo - this will be fixed as part of the @teambit/base-react.navigation.link upgrade to latest
const Link = BaseLink as any;

export const typeRefRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === TypeRefSchema.name,
  Component: TypeRefComponent,
  nodeType: 'TypeRefs',
  icon: { name: 'TypeRef', url: 'https://static.bit.dev/api-reference/type.svg' },
  default: true,
};

function TypeRefComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    apiRefModel,
    depth,
    renderers,
  } = props;
  const typeRefNode = api as TypeRefSchema;
  const TypeRefWrapper = ({ children }: { children: React.ReactNode }) =>
    depth === 0 ? (
      <APINodeDetails
        {...props}
        apiNode={{
          ...props.apiNode,
          api: copySchemaNode(typeRefNode, { signature: typeRefNode.signature || typeRefNode.toString() }),
        }}
        options={{ hideIndex: true }}
      >
        {children}
      </APINodeDetails>
    ) : (
      <>{children}</>
    );

  const exportedTypeFromSameComp = typeRefNode.isFromThisComponent()
    ? apiRefModel.getByName(typeRefNode, typeRefNode.internalFilePath)
    : undefined;

  const exportedTypeUrlFromSameComp =
    exportedTypeFromSameComp &&
    useUpdatedUrlFromQuery({
      selectedAPI: typeRefNode.isInternalReference()
        ? apiRefModel.internalAPIKey(typeRefNode, typeRefNode.internalFilePath)
        : exportedTypeFromSameComp.api.name,
    });

  const exportedTypeUrlFromAnotherComp = typeRefNode.componentId
    ? getExportedTypeUrlFromAnotherComp({
      componentId: typeRefNode.componentId,
      selectedAPI: typeRefNode.name,
    })
    : undefined;

  const packageUrl = typeRefNode.packageName ? `https://www.npmjs.com/package/${typeRefNode.packageName}` : undefined;

  const args =
    typeRefNode.typeArgs?.map((typeArg, index, typeArgs) => {
      const typeArgRenderer = renderers.find((renderer) => renderer.predicate(typeArg));

      if (typeArgRenderer) {
        return (
          <React.Fragment key={`type-arg-renderer-container-${typeArg.__schema}-${typeArg.toString()}-${index}`}>
            <typeArgRenderer.Component
              key={`type-arg-${typeArg.__schema}-${typeArg.toString()}-${index}`}
              {...props}
              className={styles.typeArgNode}
              apiNode={{ ...props.apiNode, api: typeArg, renderer: typeArgRenderer }}
              depth={(props.depth ?? 0) + 1}
              metadata={{ [typeArg.__schema]: { columnView: true } }}
            />
            {(typeArgs?.length ?? 0) > 1 && index !== (typeArgs?.length ?? 0) - 1 ? ', ' : null}
          </React.Fragment>
        );
      }

      return (
        <React.Fragment key={`type-arg-container-${typeArg.__schema}-${typeArg.toString()}-${index}`}>
          {typeArg.toString()}
          {(typeArgs?.length ?? 0) > 1 && index !== (typeArgs?.length ?? 0) - 1 ? ', ' : null}
        </React.Fragment>
      );
    }) ?? null;

  if (args) {
    return (
      <TypeRefWrapper>
        <React.Fragment key={`typeRef-with-args-container-${typeRefNode.name}`}>
          <TypeRefName
            key={`typeRef-with-args-${typeRefNode.name}`}
            name={typeRefNode.name}
            external={Boolean(exportedTypeUrlFromAnotherComp) || Boolean(packageUrl)}
            url={exportedTypeUrlFromSameComp || exportedTypeUrlFromAnotherComp || packageUrl}
            exported={typeRefNode.isExported()}
            internal={typeRefNode.isInternalReference()}
            packageName={typeRefNode.packageName}
          >
            <div key={`typeArgsContainer-${typeRefNode.name}`} className={styles.typeArgs}>
              {'<'}
              {args.map((arg) => arg)}
              {'>'}
            </div>
          </TypeRefName>
        </React.Fragment>
      </TypeRefWrapper>
    );
  }

  return (
    <TypeRefWrapper>
      <TypeRefName
        key={`typeRef-${typeRefNode.name}`}
        name={typeRefNode.name}
        external={Boolean(exportedTypeUrlFromAnotherComp) || Boolean(packageUrl)}
        url={exportedTypeUrlFromSameComp || exportedTypeUrlFromAnotherComp || packageUrl}
        exported={typeRefNode.isExported()}
        internal={typeRefNode.isInternalReference()}
        packageName={typeRefNode.packageName}
      />
    </TypeRefWrapper>
  );
}

const LinkContext = React.createContext(false);

export function TypeRefName({
  name,
  url,
  external,
  children,
  internal,
  exported,
  packageName,
}: {
  name: string;
  url?: string;
  external?: boolean;
  children?: React.ReactChild;
  internal?: boolean;
  exported?: boolean;
  packageName?: string;
}) {
  const className = classnames(nodeStyles.node, {
    [styles.internalType]: internal,
    [styles.exportedType]: exported,
    [styles.package]: !!packageName,
  });

  // Check if current component is nested within a Link.
  const withinLink = React.useContext(LinkContext);

  if (url && !withinLink) {
    return (
      <LinkContext.Provider value={true}>
        <Link href={url} external={external} className={classnames(className, styles.nodeLink)}>
          {name}
          {children}
        </Link>
      </LinkContext.Provider>
    );
  }

  return (
    <div className={className}>
      {name}
      {children}
    </div>
  );
}

function getExportedTypeUrlFromAnotherComp({
  componentId,
  selectedAPI,
}: {
  componentId: ComponentID;
  selectedAPI: string;
}) {
  const componentUrl = ComponentUrl.toUrl(componentId, { useLocationOrigin: false, includeVersion: true });
  const [componentIdUrl, versionQuery] = componentUrl.split('?');

  const exportedTypeUrl = `${componentIdUrl}/~api-reference?selectedAPI=${encodeURIComponent(selectedAPI)}${versionQuery ? `&${versionQuery}` : ''
    }`;

  return exportedTypeUrl;
}
