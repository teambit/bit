import React, { useEffect } from 'react';
import { ComponentDescriptor } from '@teambit/component-descriptor';
import classNames from 'classnames';
import { ScopeID } from '@teambit/scopes.scope-id';
import { ComponentCard, type ComponentCardPluginType, type PluginProps } from '@teambit/explorer.ui.component-card';
import { ComponentModel } from '@teambit/component';
import { LoadPreview } from '@teambit/workspace.ui.load-preview';

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
  shouldShowPreviewState?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function WorkspaceComponentCard({
  component,
  componentDescriptor,
  scope,
  plugins,
  className,
  shouldShowPreviewState: shouldShowPreviewStateFromProps,
  ...rest
}: WorkspaceComponentCardProps) {
  const [shouldShowPreviewState, togglePreview] = React.useState<boolean>(Boolean(shouldShowPreviewStateFromProps));

  useEffect(() => {
    togglePreview(Boolean(shouldShowPreviewStateFromProps));
  }, [shouldShowPreviewStateFromProps]);
  const showPreview = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!shouldShowPreviewState) {
      togglePreview(true);
    }
  };
  const loadPreviewBtnVisible =
    component.compositions.length > 0 && component?.buildStatus !== 'pending' && !shouldShowPreviewState;
  const updatedPlugins = React.useMemo(() => {
    return plugins?.map((plugin) => {
      if (plugin.preview) {
        const Preview = plugin.preview;
        return {
          ...plugin,
          preview: function PreviewWrapper(props) {
            return (
              <Preview {...props} shouldShowPreview={shouldShowPreviewState} />
            );
          },
        };
      }
      return plugin;
    });
  }, [shouldShowPreviewState, component.compositions.length]);
  if (component.deprecation?.isDeprecate) return null;
  return (
    <div key={component.id.toString()} className={classNames(styles.cardWrapper, className)} {...rest}>
      {loadPreviewBtnVisible && <LoadPreview className={styles.loadPreview} onClick={showPreview} />}
      <ComponentCard component={componentDescriptor} plugins={updatedPlugins} displayOwnerDetails="all" scope={scope} />
    </div>
  );
}
