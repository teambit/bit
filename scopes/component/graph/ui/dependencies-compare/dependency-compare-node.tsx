import { NavLink } from '@teambit/base-ui.routing.nav-link';
import { Card } from '@teambit/base-ui.surfaces.card';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { ComponentID } from '@teambit/component';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import { CompareStatusResolver } from '@teambit/component.ui.compare';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { EnvIcon } from '@teambit/envs.ui.env-icon';
import {
  compNodeClass,
  defaultNode,
  envIconClass,
  external,
  firstRowClass,
  nameClass,
  nameLineClass,
  versionClass,
} from '@teambit/graph';
import classnames from 'classnames';
import React, { useMemo } from 'react';
import { compare, valid } from 'semver';
import { CompareNodeModel } from './compare-node-model';
import styles from './dependency-compare-node.module.scss';
import variants from './dependency-compare-variants.module.scss';

function getVariant(nodeType?: string) {
  switch (nodeType) {
    case 'defaultNode':
      return defaultNode;
    case 'root':
      return variants[nodeType];
    case 'external':
      return external;
    default:
      return null;
  }
}

export type DependencyCompareNodeProps = {
  node: CompareNodeModel;
  type?: string;
};

export function DependencyCompareNode(props: DependencyCompareNodeProps) {
  const { node, type = 'defaultNode' } = props;
  const { id: baseIdStr, component: baseComponent, compareVersion, status } = node;
  const { version: baseVersion } = baseComponent;
  const baseId = ComponentID.fromString(baseIdStr);
  const versionDiff = useMemo(
    () => valid(baseVersion) && valid(compareVersion) && compare(baseVersion, compareVersion),
    [baseVersion, compareVersion]
  );

  return (
    <Card className={classnames(compNodeClass, getVariant(type))} elevation="none">
      <div className={firstRowClass}>
        <EnvIcon component={baseComponent} className={envIconClass} />
        <Breadcrumbs componentId={baseId} className={mutedText} />
      </div>
      <div className={nameLineClass}>
        <NavLink className={styles.link} external={true} href={ComponentUrl.toUrl(baseId, { includeVersion: false })}>
          <span className={classnames(nameClass, ellipsis)}>{baseId.name}</span>
        </NavLink>
        {baseId.version && <span className={classnames(versionClass, ellipsis)}>{baseId.version}</span>}
        {versionDiff !== 0 && (
          <img
            className={classnames([styles.arrowIcon, styles.versionUp])}
            src="https://static.bit.dev/bit-icons/version-bump.svg"
          />
        )}
        {compareVersion && versionDiff !== 0 && (
          <span
            className={classnames(
              styles.version,
              ellipsis,
              versionDiff === -1 && styles.versionUp,
              versionDiff === 1 && styles.versionDown
            )}
          >
            {compareVersion}
          </span>
        )}

        <div className={styles.buffs}>
          <DeprecationIcon component={baseComponent} />
          {status !== undefined && <CompareStatusResolver status={status} />}
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
