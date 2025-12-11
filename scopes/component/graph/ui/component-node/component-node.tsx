import React, { useContext } from 'react';
import classnames from 'classnames';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import type { ComponentID } from '@teambit/component';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import { EnvIcon } from '@teambit/envs.ui.env-icon';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import type { CardProps } from '@teambit/base-ui.surfaces.card';
import { Card } from '@teambit/base-ui.surfaces.card';
import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import type { NodeModel } from '../query/node-model';
import { ComponentGraphContext } from '../dependencies-graph/';

// keep order: styles, then variants
import styles from './component-node.module.scss';
import variants from './variants.module.scss';

export interface IComponentNode extends CardProps {
  node: NodeModel;
  type: string;
}

export function ComponentNode({ node, type = 'defaultNode', ...rest }: IComponentNode) {
  const graphContext = useContext(ComponentGraphContext);
  const { component, componentId } = node;
  const id = component?.id || componentId;

  return (
    <Card className={classnames(styles.compNode, variants[type])} elevation="none" {...rest}>
      <div className={styles.firstRow}>
        {component && <EnvIcon component={component} className={styles.envIcon} />}
        <Breadcrumbs componentId={id} className={mutedText} />
      </div>
      <div className={styles.nameLine}>
        <NavLink className={styles.link} external={true} href={ComponentUrl.toUrl(id, { includeVersion: false })}>
          <span className={classnames(styles.name, ellipsis)}>{id.name}</span>
        </NavLink>
        {id.version && <span className={classnames(styles.version, ellipsis)}>{id.version}</span>}

        <div className={styles.buffs}>
          {component && <DeprecationIcon component={component} />}
          {component &&
            graphContext &&
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
