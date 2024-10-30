import React, { useMemo, ComponentType } from 'react';
import { LaneModel, LanesModel, LanesHost } from '@teambit/lanes.ui.models.lanes-model';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { useCloudScopes } from '@teambit/cloud.hooks.use-cloud-scopes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import flatten from 'lodash.flatten';
import { SlotRegistry } from '@teambit/harmony';
import { ScopeComponentCard } from '@teambit/scope';
import { PreviewPlaceholder } from '@teambit/preview.ui.preview-placeholder';
import { Tooltip } from '@teambit/design.ui.tooltip';
import { ComponentID } from '@teambit/component-id';
import { ComponentModel } from '@teambit/component';
import { ScopeID } from '@teambit/scopes.scope-id';
import type { ComponentCardPluginType, PluginProps } from '@teambit/explorer.ui.component-card';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import { LaneDetails } from '@teambit/lanes.ui.lane-details';
import { EmptyLaneOverview } from './empty-lane-overview';

import styles from './lane-overview.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LaneOverviewProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
  host: LanesHost;
  useLanes?: () => { lanesModel?: LanesModel; loading?: boolean };
};

export class LinkPlugin {
  constructor(private viewedLane?: LaneModel) {}

  link = (id) => {
    if (!this.viewedLane?.id) return LanesModel.getMainComponentUrl(id);
    return LanesModel.getLaneComponentUrl(id, this.viewedLane?.id);
  };
}

export function LaneOverview({
  routeSlot,
  overviewSlot,
  host,
  useLanes: useLanesFromProps = defaultUseLanes,
}: LaneOverviewProps) {
  const { lanesModel } = useLanesFromProps();
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  const viewedLane = lanesModel?.viewedLane;

  if (!viewedLane || !viewedLane.id) return null;
  if (viewedLane.components.length === 0) return <EmptyLaneOverview name={viewedLane.id.name} />;

  return (
    <LaneOverviewWithPreview host={host} currentLane={viewedLane} overviewItems={overviewItems} routeSlot={routeSlot} />
  );
}

type LaneOverviewWithPreviewProps = {
  currentLane: LaneModel;
  overviewItems: LaneOverviewLine[];
  routeSlot: RouteSlot;
  host: LanesHost;
};

function LaneOverviewWithPreview({ currentLane, overviewItems, routeSlot, host }: LaneOverviewWithPreviewProps) {
  const { loading, components, componentDescriptors } = useLaneComponents(currentLane.id);
  const uniqueScopes = new Set(components?.map((c) => c.id.scope));
  const uniqueScopesArr = Array.from(uniqueScopes);
  const { cloudScopes = [] } = useCloudScopes(uniqueScopesArr);
  const cloudScopesById = new Map(cloudScopes.map((scope) => [scope.id.toString(), scope]));
  const compDescriptorById = new Map(componentDescriptors?.map((comp) => [comp.id.toString(), comp]));
  const compModelsById = new Map(components?.map((comp) => [comp.id.toString(), comp]));
  const plugins = useCardPlugins({ compModelsById, currentLane });

  if (loading) return null;

  const ComponentCard =
    host === 'workspace'
      ? ({ component }) => {
          if (component.deprecation?.isDeprecate) return null;
          const compDescriptor = compDescriptorById.get(component.id.toString());
          if (!compDescriptor) return null;
          const cloudScope = cloudScopesById.get(component.id.scope);
          const scope =
            cloudScope ||
            (ScopeID.isValid(component.id.scope) && { id: ScopeID.fromString(component.id.scope) }) ||
            undefined;
          return (
            <WorkspaceComponentCard
              key={component.id.toString()}
              componentDescriptor={compDescriptor}
              component={component}
              plugins={plugins}
              scope={scope}
            />
          );
        }
      : ({ component }) => {
          const compDescriptor = compDescriptorById.get(component.id.toString());
          return (
            <ScopeComponentCard
              key={component.id.toString()}
              component={component}
              plugins={plugins}
              componentDescriptor={compDescriptor}
            />
          );
        };

  return (
    <div className={styles.container}>
      <LaneDetails
        className={styles.laneDetails}
        laneId={currentLane.id}
        description={''}
        componentCount={currentLane.components.length}
      ></LaneDetails>
      <ComponentGrid className={styles.cardGrid}>
        {components?.map((component, index) => <ComponentCard component={component} key={index} />)}
      </ComponentGrid>
      {routeSlot && <SlotRouter slot={routeSlot} />}
      {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
    </div>
  );
}

export function useCardPlugins({
  compModelsById,
  currentLane,
}: {
  compModelsById: Map<string, ComponentModel>;
  currentLane?: LaneModel;
}): ComponentCardPluginType<PluginProps>[] {
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
              shouldShowPreview={shouldShowPreview}
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
      new LinkPlugin(currentLane),
    ],
    [compModelsById.size, currentLane?.id.toString()]
  );

  return plugins;
}
