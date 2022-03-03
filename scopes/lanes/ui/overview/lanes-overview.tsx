import React, { useMemo, ComponentType, useContext } from 'react';
import { LaneDetails, useLanesContext } from '@teambit/lanes.ui.lanes';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import { RouteSlot, SlotSubRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { WorkspaceComponentCard } from '@teambit/workspace.ui.workspace-component-card';
import flatten from 'lodash.flatten';
import { SlotRegistry } from '@teambit/harmony';
import WorkspaceAspect, { WorkspaceContext } from '@teambit/workspace';
import { ScopeContext } from '@teambit/scope';
// import { ComponentProvider } from '@teambit/component/ui';
// import { Compositions } from '@teambit/compositions/compositions';

import { EmptyLane } from './empty-lane-overview';

import styles from './lanes-overview.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LanesOverviewProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
  host: string;
};
export function LanesOverview({ routeSlot, overviewSlot, host }: LanesOverviewProps) {
  const lanesContext = useLanesContext();
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);
  const currentLane = lanesContext?.currentLane;
  const workspaceContext = useContext(WorkspaceContext);
  const scopeContext = useContext(ScopeContext);
  const hostContext = host === WorkspaceAspect.id ? workspaceContext : scopeContext;
  const laneReadmeComponent =
    currentLane?.readmeComponent &&
    hostContext.components.find((component) =>
      currentLane?.readmeComponent?.model.id.isEqual(component.id, { ignoreVersion: true })
    );

  if (!currentLane || !currentLane.id) return null;
  if (currentLane.components.length === 0) return <EmptyLane name={currentLane.name} />;
  const LaneReadmeAndComponents = () => {
    if (laneReadmeComponent) {
      return (
        // <ComponentProvider component={laneReadmeComponent}>
        // <Compositions />
        <ComponentGrid>
          {currentLane.components.map((component, index) => {
            return <WorkspaceComponentCard key={index} component={component.model} componentUrl={component.url} />;
          })}
        </ComponentGrid>
        // </ComponentProvider>
      );
    }
    return (
      <ComponentGrid>
        {currentLane.components.map((component, index) => {
          return <WorkspaceComponentCard key={index} component={component.model} componentUrl={component.url} />;
        })}
      </ComponentGrid>
    );
  };
  return (
    <div className={styles.container}>
      <LaneDetails
        laneName={currentLane.id}
        description={''}
        componentCount={currentLane.components.length}
      ></LaneDetails>
      <div className={styles.laneComponentContainer}>
        <LaneReadmeAndComponents />
      </div>
      {routeSlot && <SlotSubRouter slot={routeSlot} />}
      {overviewItems.length > 0 && overviewItems.map((Item, index) => <Item key={index} />)}
    </div>
  );
}
