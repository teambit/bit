import React from 'react';
import { LaneDetails, useLanesContext } from '@teambit/lanes.ui.lanes';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import { EmptyLane } from './empty-lane-overview';
import styles from './lanes-overview.module.scss';

export type LanesOverviewProps = {
  routeSlot: RouteSlot;
};
export function LanesOverview({ routeSlot }: LanesOverviewProps) {
  const { model } = useLanesContext();

  const currentLane = model?.currentLane;

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
          return <WorkspaceComponentCard key={index} component={component.model} componentUrl={component.url} />;
        })}
      </ComponentGrid>
      {routeSlot && <SlotSubRouter slot={routeSlot} />}
    </div>
  );
}
