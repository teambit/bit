import React, { useContext } from 'react';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { EmptyWorkspace } from '@teambit/workspace.ui.empty-workspace';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentID } from '@teambit/component-id';
import type { ComponentModel } from '@teambit/component';
import { useCloudScopes } from '@teambit/cloud.hooks.use-cloud-scopes';
import { ScopeID } from '@teambit/scopes.scope-id';
import { compact } from 'lodash';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import type { ComponentCardPluginType, PluginProps } from '@teambit/explorer.ui.component-card';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { WorkspaceContext } from '../workspace-context';
import styles from './workspace-overview.module.scss';
import { LinkPlugin } from './link-plugin';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { isMinimal } = useWorkspaceMode();
  const compModelsById = new Map(workspace.components.map((comp) => [comp.id.toString(), comp]));
  const { components, componentDescriptors } = workspace;
  const uniqueScopes = new Set(components.map((c) => c.id.scope));
  const uniqueScopesArr = Array.from(uniqueScopes);
  const { cloudScopes = [] } = useCloudScopes(uniqueScopesArr);
  const cloudScopesById = new Map(cloudScopes.map((scope) => [scope.id.toString(), scope]));

  const plugins = useCardPlugins({ compModelsById, showPreview: isMinimal });

  if (!components || components.length === 0) return <EmptyWorkspace name={workspace.name} />;

  const compDescriptorById = new Map(componentDescriptors.map((comp) => [comp.id.toString(), comp]));
  const componentsWithDescriptorAndScope = compact(
    components.map((component) => {
      if (component.deprecation?.isDeprecate) return null;
      const componentDescriptor = compDescriptorById.get(component.id.toString());
      if (!componentDescriptor) return null;
      const cloudScope = cloudScopesById.get(component.id.scope);
      const scope =
        cloudScope ||
        (ScopeID.isValid(component.id.scope) && { id: ScopeID.fromString(component.id.scope) }) ||
        undefined;

      return { component, componentDescriptor, scope };
    })
  );

  return (
    <div className={styles.container}>
      <ComponentGrid className={styles.cardGrid}>
        {componentsWithDescriptorAndScope.map(({ component, componentDescriptor, scope }) => {
          return (
            <WorkspaceComponentCard
              key={component.id.toString()}
              componentDescriptor={componentDescriptor}
              component={component}
              plugins={plugins}
              scope={scope}
              shouldShowPreviewState={isMinimal}
            />
          );
        })}
      </ComponentGrid>
    </div>
  );
}

export function useCardPlugins({
  compModelsById,
  showPreview,
}: {
  compModelsById: Map<string, ComponentModel>;
  showPreview?: boolean;
}): ComponentCardPluginType<PluginProps>[] {
  const serverUrlsSignature = React.useMemo(() => {
    const serversCount = Array.from(compModelsById.values())
      .filter((comp) => comp.server?.url)
      .map((comp) => comp.server?.url)
      .join(',');
    return serversCount;
  }, [compModelsById]);

  const plugins = React.useMemo(
    () => [
      {
        preview: function Preview({ component, shouldShowPreview }) {
          const compModel = compModelsById.get(component.id.toString());
          if (!compModel) return null;
          return (
            <PreviewPlaceholder
              componentDescriptor={component}
              component={compModel}
              shouldShowPreview={showPreview || shouldShowPreview}
            />
          );
        },
      },
      {
        previewBottomRight: function PreviewBottomRight({ component }) {
          const env = component.get('teambit.envs/envs');
          const envComponentId = env?.id ? ComponentID.fromString(env?.id) : undefined;

          return (
            <div className={styles.rightPreviewPlugins}>
              <div className={styles.badge}>
                <Tooltip delay={300} content={envComponentId?.name}>
                  <img src={env?.icon} className={styles.envIcon} />
                </Tooltip>
              </div>
            </div>
          );
        },
      },
      new LinkPlugin(),
    ],
    [compModelsById.size, serverUrlsSignature, showPreview]
  );

  return plugins;
}
