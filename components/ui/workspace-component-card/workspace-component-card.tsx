import React from 'react';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import classNames from 'classnames';
import type { ScopeID } from '@teambit/scopes.scope-id';
import { ComponentCard, type ComponentCardPluginType, type PluginProps } from '@teambit/explorer.ui.component-card';
import type { ComponentModel } from '@teambit/component';
import styles from './workspace-component-card.module.scss';

export type WorkspaceComponentCardProps = {
  component: ComponentModel;
  componentDescriptor: ComponentDescriptor;
  plugins?: ComponentCardPluginType<PluginProps>[];
  scope?: {
    icon?: string;
    backgroundIconColor?: string;
    id: ScopeID;
  };
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>;

export function WorkspaceComponentCard({
  component,
  componentDescriptor,
  scope,
  plugins,
  className,
  ...rest
}: WorkspaceComponentCardProps) {
  if (component.deprecation?.isDeprecate) return null;

  return (
    <div key={component.id.toString()} className={classNames(styles.cardWrapper, className)} {...rest}>
      <ComponentCard component={componentDescriptor} plugins={plugins} displayOwnerDetails="all" scope={scope} />
    </div>
  );
}
