import React, { ComponentType } from 'react';
import { ScopeIdentifier } from '../../default-plugins';
import classNames from 'classnames';
import semver from 'semver';
import type { ComponentID } from '@teambit/component-id';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import { ellipsis as truncate } from '@teambit/toolbox.string.ellipsis';
import { ScopeID } from '@teambit/scopes.scope-id';
import { ScopeIcon } from '@teambit/scope.ui.scope-icon';
import { Tooltip } from '@teambit/design.ui.tooltip';
import styles from './details.module.scss';

export type ComponentDetailsProps = {
  /**
   * component id
   */
  componentId: ComponentID;
  /**
   * component description
   */
  description?: string;

  component: ComponentDescriptor;

  scope?: ScopeIdentifier;

  /**
   * the type of owner details to be displayed in namespace section. defaults to none.
   */
  displayOwnerDetails?: 'all' | 'none';
} & React.HTMLAttributes<HTMLDivElement>;

export function ComponentDetails({
  componentId,
  description = '',
  scope: targetScope,
  component,
  displayOwnerDetails = 'none',
  className,
  ...rest
}: ComponentDetailsProps) {
  if (!componentId) return null;

  const { version, name } = componentId;
  const displayVersion = semver.valid(version) ? `${version}` : version.substring(0, 6);
  const scopeId = ScopeID.isValid(componentId.scope) ? ScopeID.fromString(componentId.scope) : undefined;
  const scopeIdStr = scopeId?.toString() ?? componentId.scope;
  const totalSize = component.id.fullName.length;
  // const envIcon = component.get<any>("teambit.envs/envs")?.data?.icon;

  // @ts-ignore
  const scope = targetScope || component?.scopeDescriptor;

  return (
    <div {...rest} className={classNames(styles.content, className)}>
      {/* <div> */}
      {/* <div className={styles.nameSpace}>{displayBrearcrumbs}</div> */}
      {/* {leftOfNamePlugins.map((Plugin) => <Plugin component={component} />)} */}
      {/* <span className={styles.owner}>by @{scopeId.owner}</span> */}
      <div>
        {/* <img src={envIcon} className={styles.envIcon} /> */}
        <div className={styles.name}>
          <Tooltip content={scopeIdStr}>
            <div>
              <ScopeIcon
                className={classNames(styles.scopeIcon)}
                displayName={scope?.id?.scopeName ?? scopeIdStr}
                scopeImage={scope?.icon}
                bgColor={scope?.backgroundIconColor || 'rgb(0, 0, 0)'}
                size={22}
              />
            </div>
          </Tooltip>

          <span className={classNames(styles.breadcrumb)}>
            {totalSize < 28 && componentId.namespace}
            {totalSize < 28 && componentId.namespace && '/'}
          </span>
          <span className={classNames(styles.componentName)}>{truncate(name, 25)}</span>
          {version && (
            <>
              {/* <Icon of="version-tag-stroke" className={styles.versionIcon} /> */}
              <span className={classNames(styles.version)}>{displayVersion}</span>
            </>
          )}
        </div>
      </div>
      {/* <div className={styles.scopeId}>
      <span className={styles.scopeName}>#{scopeId.toString()}</span>
    </div> */}
      {/* <div> */}
      {/* </div> */}
      {/* <Icon of="" /> */}
      {/* </div> */}
    </div>
  );
}
