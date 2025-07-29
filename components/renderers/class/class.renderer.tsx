import React from 'react';
import { ClassSchema } from '@teambit/semantics.entities.semantic-schema';
import { APINodeRenderProps, APINodeRenderer } from '@teambit/api-reference.models.api-node-renderer';
import { APINodeDetails } from '@teambit/api-reference.renderers.api-node-details';
import { GroupedSchemaNodesSummary } from '@teambit/api-reference.renderers.grouped-schema-nodes-summary';
import { SchemaNodesSummary } from '@teambit/api-reference.overview.renderers.grouped-schema-nodes-overview-summary';
import styles from './class.renderer.module.scss';

export const classRenderer: APINodeRenderer = {
  predicate: (node) => node.__schema === ClassSchema.name,
  Component: ClassComponent,
  OverviewComponent: ClassOverviewComponent,
  nodeType: 'Classes',
  icon: { name: 'Class', url: 'https://static.bit.dev/api-reference/class.svg' },
  default: true,
};

function ClassComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api },
    metadata,
    renderers,
    // depth
  } = props;
  const classNode = api as ClassSchema;
  const { extendsNodes, implementNodes, signature, members, decorators } = classNode;

  if (metadata?.columnView?.[api.__schema]) {
    // todo handle when recursively rendering a class
    return <React.Fragment key={`class-column-view-${classNode.toString()}`}>{classNode.toString()}</React.Fragment>;
  }

  const extendsSignature = extendsNodes?.[0]?.name;
  const implementsDefinition = implementNodes?.[0]?.name;
  const hasDecorators = decorators?.length;
  const displaySignature = `${
    hasDecorators ? decorators.reduce((acc, decorator) => acc.concat(`${decorator.toString()}\n`), '') : ''
  }${signature}${(extendsSignature && ' '.concat(extendsSignature)) || ''} ${implementsDefinition || ''}`;

  return (
    <APINodeDetails {...props} displaySignature={displaySignature}>
      <div className={styles.members}>
        {hasDecorators && (
          <div className={styles.decorators}>
            <div className={styles.decoratorsTitle}>Decorators</div>
            {decorators.map((decorator) => {
              const decoratorRenderer = renderers.find((renderer) => renderer.predicate(decorator));
              const DecoratorComponent = decoratorRenderer?.Component;
              if (!DecoratorComponent) return null;
              return (
                <DecoratorComponent
                  key={`decorator-${decorator.name}`}
                  {...props}
                  apiNode={{ ...props.apiNode, renderer: decoratorRenderer, api: decorator }}
                />
              );
            })}
          </div>
        )}
        <GroupedSchemaNodesSummary nodes={members} apiNodeRendererProps={props} />
      </div>
    </APINodeDetails>
  );
}

function ClassOverviewComponent(props: APINodeRenderProps) {
  const {
    apiNode: { api, renderer },
  } = props;
  const classNode = api as ClassSchema;
  const { members, doc } = classNode;

  const icon = renderer.icon;
  const description =
    doc?.comment ?? doc?.tags?.filter((tag) => tag.comment).reduce((acc, tag) => acc.concat(`${tag.comment}\n`), '');
  return (
    <SchemaNodesSummary
      name={classNode.name}
      description={description}
      icon={icon}
      nodes={members}
      apiNodeRendererProps={props}
    />
  );
}
