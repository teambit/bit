import React from 'react';
import { Navigate } from 'react-router-dom';
import { LaneReadme, useLanesContext, LaneOverviewLineSlot } from '@teambit/lanes.ui.lanes';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';

export type LaneReadmeOverviewProps = {
  host: string;
  overviewSlot?: LaneOverviewLineSlot;
  routeSlot: RouteSlot;
};

export function LaneReadmeOverview({ host, overviewSlot, routeSlot }: LaneReadmeOverviewProps) {
  const lanesContext = useLanesContext();
  const viewedLane = lanesContext?.viewedLane;
  const readmeComponent = viewedLane?.readmeComponent;

  if (readmeComponent) {
    return <LaneReadme host={host} viewedLane={viewedLane} overviewSlot={overviewSlot} routeSlot={routeSlot} />;
  }

  return <Navigate to={`./~gallery`} replace />;
}
