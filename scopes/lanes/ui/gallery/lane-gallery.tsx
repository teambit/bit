import React, { useMemo, ComponentType } from 'react';
import { LaneDetails, useLanesContext, useLaneComponents, LaneModel, LanesModel } from '@teambit/lanes.ui.lanes';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import flatten from 'lodash.flatten';
import { SlotRegistry } from '@teambit/harmony';
import { EmptyLane } from './empty-lane-overview';

import styles from './lane-gallery.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LaneGalleryProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
};

export function LaneGallery({ routeSlot, overviewSlot }: LaneGalleryProps) {
  const lanesContext = useLanesContext();
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  const currentLane = lanesContext?.viewedLane;

  if (!currentLane || !currentLane.id) return null;
  if (currentLane.components.length === 0) return <EmptyLane name={currentLane.name} />;

  return <LaneGalleryWithPreview currentLane={currentLane} overviewItems={overviewItems} routeSlot={routeSlot} />;
}

type LaneOverviewWithPreviewProps = {
  currentLane: LaneModel;
  overviewItems: LaneOverviewLine[];
  routeSlot: RouteSlot;
};

function LaneGalleryWithPreview({ currentLane, overviewItems, routeSlot }: LaneOverviewWithPreviewProps) {
  const { loading, components } = useLaneComponents(currentLane);

  if (loading) return null;

  return (
    <div className={styles.container}>
      <LaneDetails
        className={styles.laneDetails}
        laneName={currentLane.id}
        description={''}
        componentCount={currentLane.components.length}
      ></LaneDetails>
      <ComponentGrid>
        {components?.map((component, index) => {
          return (
            <WorkspaceComponentCard
              key={index}
              component={component}
              componentUrl={LanesModel.getLaneComponentUrl(component.id, currentLane.id)}
            />
          );
        })}
      </ComponentGrid>
      {routeSlot && <SlotSubRouter slot={routeSlot} />}
      {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
    </div>
  );
}
