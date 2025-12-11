import type { ComponentType } from 'react';
import React, { useContext } from 'react';
import type { ScopeID } from '@teambit/scopes.scope-id';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { ScopeDetails } from '@teambit/scope.ui.scope-details';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { EmptyScope } from '@teambit/scope.ui.empty-scope';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentID } from '@teambit/component-id';
import { ComponentCard, type ComponentCardPluginType, type PluginProps } from '@teambit/explorer.ui.component-card';
import type { ComponentModel } from '@teambit/component';
import { ScopeContext } from '@teambit/scope.ui.hooks.scope-context';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import styles from './scope-overview.module.scss';
import type { ScopeBadgeSlot, OverviewLineSlot } from '../../scope.ui.runtime';

export type ScopeOverviewProps = {
  badgeSlot: ScopeBadgeSlot;
  overviewSlot: OverviewLineSlot;
  TargetOverview?: ComponentType;
};

export class LinkPlugin {
  link(id) {
    return id.fullName;
  }
}

export function ScopeOverview({ badgeSlot, overviewSlot, TargetOverview }: ScopeOverviewProps) {
  const scope = useContext(ScopeContext);
  const { components, componentDescriptors } = scope;
  if (TargetOverview) return <TargetOverview />;
  if (!components || components.length === 0) return <EmptyScope name={scope.name} />;
  const compDescriptorById = new Map(componentDescriptors.map((comp) => [comp.id.toString(), comp]));
  const compModelsById = new Map(components.map((comp) => [comp.id.toString(), comp]));
  const plugins = useCardPlugins({ compModelsById });

  return (
    <div className={styles.container}>
      <ScopeDetails
        scopeName={scope.name}
        icon={scope.icon}
        backgroundIconColor={scope.backgroundIconColor}
        badgeSlot={badgeSlot}
        overviewSlot={overviewSlot}
        description={scope.description}
        componentCount={scope.components.length}
      />
      <ComponentGrid className={styles.cardGrid}>
        {components.map((component) => {
          if (component.deprecation?.isDeprecate) return null;
          return (
            <div key={component.id.toString()}>
              <ScopeComponentCard
                component={component}
                plugins={plugins}
                componentDescriptor={compDescriptorById.get(component.id.toString())}
              />
            </div>
          );
        })}
      </ComponentGrid>
    </div>
  );
}

type ScopeComponentCardProps = {
  component?: ComponentModel;
  componentDescriptor?: ComponentDescriptor;
  plugins?: ComponentCardPluginType<PluginProps>[];
  scope?: {
    icon?: string;
    backgroundIconColor?: string;
    id: ScopeID;
  };
  componentUrl?: string;
};

export function ScopeComponentCard({ componentDescriptor, plugins }: ScopeComponentCardProps) {
  if (!componentDescriptor) return null;

  return <ComponentCard plugins={plugins} component={componentDescriptor} />;
}

export function useCardPlugins({
  compModelsById,
}: {
  compModelsById: Map<string, ComponentModel>;
}): ComponentCardPluginType<PluginProps>[] {
  const plugins = React.useMemo(
    () => [
      {
        preview: function Preview({ component }) {
          const compModel = compModelsById.get(component.id.toString());
          if (!compModel) return null;
          return (
            <PreviewPlaceholder
              componentDescriptor={component}
              component={compModel}
              shouldShowPreview={compModel.compositions.length > 0}
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
    [compModelsById.size]
  );

  return plugins;
}
