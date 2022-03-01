import React, { useMemo, ComponentType } from 'react';
import { LaneDetails, useLanesContext } from '@teambit/lanes.ui.lanes';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import flatten from 'lodash.flatten';
import { SlotRegistry } from '@teambit/harmony';
import { EmptyLane } from './empty-lane-overview';

import styles from './lanes-overview.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LanesOverviewProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
};
export function LanesOverview({ routeSlot, overviewSlot }: LanesOverviewProps) {
  const lanesContext = useLanesContext();
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  const currentLane = lanesContext?.currentLane;

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
      {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
    </div>
  );
}
