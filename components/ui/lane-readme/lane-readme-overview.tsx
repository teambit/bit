import React from 'react';
import { Navigate } from 'react-router-dom';
import { LaneOverviewLineSlot } from '@teambit/lanes.ui.lane-overview';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { useLanes } from '@teambit/lanes.hooks.use-lanes';
import { LaneReadme } from './lane-readme';

export type LaneReadmeOverviewProps = {
  host: string;
  overviewSlot?: LaneOverviewLineSlot;
  routeSlot: RouteSlot;
};

export function LaneReadmeOverview({ host, overviewSlot, routeSlot }: LaneReadmeOverviewProps) {
  const { lanesModel } = useLanes();
  const viewedLane = lanesModel?.viewedLane;
  const readmeComponent = viewedLane?.readmeComponent;

  if (readmeComponent) {
    return <LaneReadme host={host} viewedLane={viewedLane} overviewSlot={overviewSlot} routeSlot={routeSlot} />;
  }

  return <Navigate to={`./~gallery`} replace />;
}
