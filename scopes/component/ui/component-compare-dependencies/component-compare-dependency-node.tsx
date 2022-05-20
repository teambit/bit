import {Card} from '@teambit/base-ui.surfaces.card';
import {mutedText} from '@teambit/base-ui.text.muted-text';
import {ComponentID} from '@teambit/component';
import {useComponentCompareContext} from '@teambit/component.ui.component-compare';
import {DeprecationIcon} from '@teambit/component.ui.deprecation-icon';
import {ellipsis} from '@teambit/design.ui.styles.ellipsis';
import {EnvIcon} from '@teambit/envs.ui.env-icon';
import classnames from 'classnames';
import React from 'react';
import styles from './component-compare-dependency-node.module.scss';
import variants from './component-compare-dependency-variants.module.scss';

export type ComponentCompareDependencyNodeProps = {
  type?: string; // todo: review
};

export function ComponentCompareDependencyNode(props: ComponentCompareDependencyNodeProps) {
  const { type = 'defaultNode' } = props;
  const componentCompare = useComponentCompareContext();

  if (componentCompare === undefined) {
    return <></>;
  }

  const {base: baseComponent, compare: compareComponent} = componentCompare;
  const { id: baseId } = baseComponent;
  const { id: compareId } = compareComponent;

  return (
    <Card className={classnames(styles.compNode, variants[type])} elevation="none">
      <div className={styles.firstRow}>
        <Breadcrumbs componentId={baseId} className={mutedText} />
        <EnvIcon component={baseComponent} className={styles.envIcon} />
      </div>
      <div className={styles.nameLine}>
        <span className={classnames(styles.name, ellipsis)}>{baseId.name}</span>
        {baseId.version && <span className={classnames(styles.version, ellipsis)}>{baseId.version}</span>}
        <img className={styles.arrowIcon} src="https://static.bit.dev/bit-icons/arrow-right-bold.svg" />
        {compareId.version && <span className={classnames(styles.version, ellipsis)}>{compareId.version}</span>}

        <div className={styles.buffs}>
          <DeprecationIcon component={baseComponent} />
          {/* {graphContext &&
              graphContext.componentWidgets
                .toArray()
                .map(([widgetId, Widget]) => <Widget key={widgetId} component={component} />)} */}
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
