import React, { useMemo, ComponentType } from 'react';
import { LaneModel, LanesModel, LanesHost } from '@teambit/lanes.ui.models.lanes-model';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import flatten from 'lodash.flatten';
import { SlotRegistry } from '@teambit/harmony';
import { ScopeComponentCard } from '@teambit/scope';
import { LaneDetails } from '@teambit/lanes.ui.lane-details';
import { EmptyLaneOverview } from './empty-lane-overview';

import styles from './lane-overview.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LaneOverviewProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
  host: LanesHost;
};
export function LaneOverview({ routeSlot, overviewSlot, host }: LaneOverviewProps) {
  const { lanesModel } = useLanes();
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  const currentLane = lanesModel?.viewedLane;

  if (!currentLane || !currentLane.id) return null;
  if (currentLane.components.length === 0) return <EmptyLaneOverview name={currentLane.id.name} />;

  return (
    <LaneOverviewWithPreview
      host={host}
      currentLane={currentLane}
      overviewItems={overviewItems}
      routeSlot={routeSlot}
    />
  );
}

type LaneOverviewWithPreviewProps = {
  currentLane: LaneModel;
  overviewItems: LaneOverviewLine[];
  routeSlot: RouteSlot;
  host: LanesHost;
};

function LaneOverviewWithPreview({ currentLane, overviewItems, routeSlot, host }: LaneOverviewWithPreviewProps) {
  const { loading, components } = useLaneComponents(currentLane.id);

  if (loading) return null;

  const ComponentCard =
    host === 'workspace'
      ? ({ component }) => (
          <WorkspaceComponentCard
            component={component}
            componentUrl={LanesModel.getLaneComponentUrl(component.id, currentLane.id)}
          />
        )
      : ({ component }) => (
          <ScopeComponentCard
            component={component}
            componentUrl={LanesModel.getLaneComponentUrl(component.id, currentLane.id)}
          />
        );

  return (
    <div className={styles.container}>
      <LaneDetails
        className={styles.laneDetails}
        laneId={currentLane.id}
        description={''}
        componentCount={currentLane.components.length}
      ></LaneDetails>
      <ComponentGrid>
        {components?.map((component, index) => (
          <ComponentCard component={component} key={index} />
        ))}
      </ComponentGrid>
      {routeSlot && <SlotRouter slot={routeSlot} />}
      {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
    </div>
  );
}
