import React, { useMemo, ComponentType } from 'react';
import {
  LaneDetails,
  useLanesContext,
  useLaneComponentsQuery,
  LaneModel,
  LanesModel,
  LanesHost,
} from '@teambit/lanes.ui.lanes';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import flatten from 'lodash.flatten';
import { SlotRegistry } from '@teambit/harmony';
import { EmptyLane } from './empty-lane-overview';
import { ScopeComponentCard } from '@teambit/scope';

import styles from './lanes-overview.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LanesOverviewProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
  host: LanesHost;
};
export function LanesOverview({ routeSlot, overviewSlot, host }: LanesOverviewProps) {
  const lanesContext = useLanesContext();
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  const currentLane = lanesContext?.viewedLane;

  if (!currentLane || !currentLane.id) return null;
  if (currentLane.components.length === 0) return <EmptyLane name={currentLane.name} />;

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
  const { loading, components } = useLaneComponentsQuery(currentLane);

  if (loading) return null;

  const ComponentCard =
    host === 'workspace'
      ? ({ component }) => (
          <WorkspaceComponentCard
            component={component}
            componentUrl={LanesModel.getLaneComponentUrl(component.id, currentLane.id)}
          />
        )
      : ({ component }) => <ScopeComponentCard component={component} />;

  return (
    <div className={styles.container}>
      <LaneDetails
        laneName={currentLane.id}
        description={''}
        componentCount={currentLane.components.length}
      ></LaneDetails>
      <ComponentGrid>
        {components?.map((component, index) => (
          <ComponentCard component={component} key={index} />
        ))}
      </ComponentGrid>
      {routeSlot && <SlotSubRouter slot={routeSlot} />}
      {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
    </div>
  );
}
