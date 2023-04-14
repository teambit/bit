import React, { useMemo, ComponentType } from 'react';
import {
  LaneDetails,
  useLanesContext,
  useLaneComponents,
  LaneModel,
  LanesModel,
  LanesHost,
} from '@teambit/lanes.ui.lanes';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import flatten from 'lodash.flatten';
import { SlotRegistry } from '@teambit/harmony';
import { ScopeComponentCard } from '@teambit/scope';
import { EmptyLane } from './empty-lane-overview';

import styles from './lane-gallery.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LaneGalleryProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
  host: LanesHost;
};
export function LaneGallery({ routeSlot, overviewSlot, host }: LaneGalleryProps) {
  const lanesContext = useLanesContext();
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  const currentLane = lanesContext?.viewedLane;

  if (!currentLane || !currentLane.id) return null;
  if (currentLane.components.length === 0) return <EmptyLane name={currentLane.name} />;

  return (
    <LaneGalleryWithPreview host={host} currentLane={currentLane} overviewItems={overviewItems} routeSlot={routeSlot} />
  );
}

type LaneGalleryWithPreviewProps = {
  currentLane: LaneModel;
  overviewItems: LaneOverviewLine[];
  routeSlot: RouteSlot;
  host: LanesHost;
};

function LaneGalleryWithPreview({ currentLane, overviewItems, routeSlot, host }: LaneGalleryWithPreviewProps) {
  const { loading, components } = useLaneComponents(currentLane);

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
        laneName={currentLane.id}
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
