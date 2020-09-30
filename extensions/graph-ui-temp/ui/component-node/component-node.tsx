import React, { useContext } from 'react';
import classnames from 'classnames';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { ComponentID, ComponentModel } from '@teambit/component';
import { DeprecationIcon } from '@teambit/staged-components.deprecation-icon';

import { NodeModel } from '../query/graph-model';
import { ComponentGraphContext } from '../dependencies-graph/';

// keep order: styles, then variants
import styles from './component-node.module.scss';
import variants from './variants.module.scss';

export function ComponentNode({ node, type = 'defaultNode' }: { node: NodeModel; type: string }) {
  const graphContext = useContext(ComponentGraphContext);
  const { component } = node;
  const { id } = component;

  return (
    <div className={classnames(styles.compNode, variants[type])}>
      <Breadcrumbs componentId={id} className={mutedText} />
      <div className={styles.nameLine}>
        <span className={styles.name}>{id.name}</span>
        {id.version && <span className={styles.version}>{id.version}</span>}
      </div>
      <div className={styles.buffs}>
        <EnvIcon component={component} />
        <DeprecationIcon component={component} />
        {graphContext &&
          graphContext.componentWidgets.toArray().map(([widgetId, Widget]) => <Widget key={widgetId} component={component} />)}
      </div>
    </div>
  );
}

type BreadcrumbsProps = { componentId: ComponentID } & React.HTMLAttributes<HTMLDivElement>;

function Breadcrumbs({ componentId, className, ...rest }: BreadcrumbsProps) {
  const { scope, namespace } = componentId;
  const showSep = !!scope && !!namespace;

  return (
    <div {...rest} className={classnames(styles.breadcrumbs, className)}>
      {scope}
      {showSep && '/'}
      {namespace}
    </div>
  );
}

// TODO - unify with sidebar widgets
type EnvIconProps = { component: ComponentModel } & React.HTMLAttributes<HTMLDivElement>;
function EnvIcon({ component, ...rest }: EnvIconProps) {
  if (!component || !component.environment?.icon) return null;

  return <img src={component.environment?.icon} alt={component.environment.id} {...rest} />;
}
