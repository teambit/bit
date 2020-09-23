import React from 'react';
import classnames from 'classnames';
import { mutedText } from '@teambit/base-ui.text.muted-text';

import { NodeModel } from '../query/graph-model';

import styles from './component-node.module.scss';
import { ComponentID, ComponentModel } from '@teambit/component';

export function ComponentNode({ node }: { node: NodeModel }) {
  const { component } = node;
  const { id } = component;

  return (
    <div className={styles.compNode}>
      <Breadcrumbs componentId={id} className={mutedText} />
      <div className={styles.nameLine}>
        <span className={styles.name}>{id.name}</span>
        {id.version && <span className={styles.version}>{id.version}</span>}
      </div>
      <div className={styles.buffs}>
        <EnvIcon component={component} />
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

type EnvIconProps = { component: ComponentModel } & React.HTMLAttributes<HTMLDivElement>;
function EnvIcon({ component, ...rest }: EnvIconProps) {
  if (!component || !component.environment?.icon) return null;

  return <img src={component.environment?.icon} alt={component.environment.id} {...rest} />;
}
