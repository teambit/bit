import { Card } from '@teambit/base-ui.surfaces.card';
import { mutedText } from '@teambit/base-ui.text.muted-text';
import { ComponentID } from '@teambit/component';
import { DeprecationIcon } from '@teambit/component.ui.deprecation-icon';
import { ellipsis } from '@teambit/design.ui.styles.ellipsis';
import { EnvIcon } from '@teambit/envs.ui.env-icon';
import classnames from 'classnames';
import React, { useState, useEffect } from 'react';
import { valid, compare } from 'semver';
import styles from './component-compare-dependency-node.module.scss';
import variants from './component-compare-dependency-variants.module.scss';
import { CompareNodeModel } from './compare-node-model';
import { ComponentCompareStatusResolver } from '@teambit/component.ui.component-compare-status-resolver';

export type ComponentCompareDependencyNodeProps = {
  node: CompareNodeModel;
  type?: string; // todo: review
};

export function ComponentCompareDependencyNode(props: ComponentCompareDependencyNodeProps) {
  const { node, type = 'defaultNode' } = props;
  const [versionDiff, setVersionDiff] = useState(0);

  const { id: baseIdStr, component: baseComponent, compareVersion, status } = node;
  const { version: baseVersion } = baseComponent;
  const baseId = ComponentID.fromString(baseIdStr);

  useEffect(() => {
    if (valid(baseVersion) && valid(compareVersion)) {
      setVersionDiff(compare(baseVersion, compareVersion));
    }
  }, [baseVersion, compareVersion]);

  return (
    <Card className={classnames(styles.compNode, variants[type])} elevation="none">
      <div className={styles.firstRow}>
        <Breadcrumbs componentId={baseId} className={mutedText} />
        <EnvIcon component={baseComponent} className={styles.envIcon} />
      </div>
      <div className={styles.nameLine}>
        <span className={classnames(styles.name, ellipsis)}>{baseId.name}</span>
        {baseId.version && <span className={classnames(styles.version, ellipsis)}>{baseId.version}</span>}
        <img
          className={classnames([styles.arrowIcon, styles.versionUp])}
          src="https://static.bit.dev/bit-icons/arrow-right-bold.svg"
        />
        {compareVersion && (
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
          {status !== 'unchanged' && <ComponentCompareStatusResolver status={status} />}
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
