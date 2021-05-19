import React, { useContext } from 'react';
import classnames from 'classnames';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { ComponentID } from '@teambit/component';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import { EnvIcon } from '@teambit/envs.ui.env-icon';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { Card, CardProps } from '@teambit/base-ui.surfaces.card';
import { NodeModel } from '../query/node-model';
import { ComponentGraphContext } from '../dependencies-graph/';

// keep order: styles, then variants
import styles from './component-node.module.scss';
import variants from './variants.module.scss';

export interface ComponentNode extends CardProps {
  node: NodeModel;
  type: string;
}

export function ComponentNode({ node, type = 'defaultNode', ...rest }: ComponentNode) {
  const graphContext = useContext(ComponentGraphContext);
  const { component } = node;
  const { id } = component;

  return (
    <Card className={classnames(styles.compNode, variants[type])} elevation="none" {...rest}>
      <div className={styles.firstRow}>
        <EnvIcon component={component} className={styles.envIcon} />
        <Breadcrumbs componentId={id} className={mutedText} />
      </div>
      <div className={styles.nameLine}>
        <span className={classnames(styles.name, ellipsis)}>{id.name}</span>
        {id.version && <span className={classnames(styles.version, ellipsis)}>{id.version}</span>}

        <div className={styles.buffs}>
          <DeprecationIcon component={component} />
          {graphContext &&
            graphContext.componentWidgets
              .toArray()
              .map(([widgetId, Widget]) => <Widget key={widgetId} component={component} />)}
        </div>
      </div>
    </Card>
  );
}

type BreadcrumbsProps = { componentId: ComponentID } & React.HTMLAttributes<HTMLDivElement>;

function Breadcrumbs({ componentId, className, ...rest }: BreadcrumbsProps) {
  const { scope, namespace } = componentId;
  const showSep = !!scope && !!namespace;

  return (
    <div {...rest} className={classnames(styles.breadcrumbs, ellipsis, className)}>
      {scope}
      {showSep && '/'}
      {namespace}
    </div>
  );
}
