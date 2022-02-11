import React from 'react';
import { LaneDetails, LaneComponentCard, useLanesContext } from '@teambit/lanes.lanes.ui';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { EmptyLane } from './empty-lane-overview';
import styles from './lanes-overview.module.scss';

export type LanesOverviewProps = {
  routeSlot: RouteSlot;
};
export function LanesOverview({ routeSlot }: LanesOverviewProps) {
  const { model } = useLanesContext();

  const currentLane = model?.currentLane;
  // const laneComponents = currentLane?.components;
  // const laneComponentIds = laneComponents?.map((lc) => lc.id.toString()) || [];

  if (!currentLane || !currentLane.id) return null;
  if (currentLane.components.length === 0) return <EmptyLane name={currentLane.name} />;

  return (
    <div className={styles.container}>
      <LaneDetails
        laneName={currentLane.id}
        description={''}
        componentCount={currentLane.components.length}
      ></LaneDetails>
      <ComponentGrid>
        {currentLane.components.map((component, index) => {
          return <LaneComponentCard key={index} component={component} />;
        })}
      </ComponentGrid>
      {routeSlot && <SlotSubRouter slot={routeSlot} />}
    </div>
  );
}
