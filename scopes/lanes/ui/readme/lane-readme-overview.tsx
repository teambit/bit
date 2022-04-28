import React from 'react';
import { ReactRouter } from '@teambit/react-router';
import { LaneReadme, useLanesContext, LanesModel, LaneOverviewLineSlot } from '@teambit/lanes.ui.lanes';
import { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';

export type LaneReadmeOverviewProps = {
  host: string;
  overviewSlot?: LaneOverviewLineSlot;
  routeSlot: RouteSlot;
};

export function LaneReadmeOverview({ host, overviewSlot, routeSlot }: LaneReadmeOverviewProps) {
  const lanesContext = useLanesContext();
  const currentLane = lanesContext?.currentLane;
  const readmeComponent = currentLane?.readmeComponent;

  if (readmeComponent) {
    return <LaneReadme host={host} currentLane={currentLane} overviewSlot={overviewSlot} routeSlot={routeSlot} />;
  }

  if (currentLane) {
    return <ReactRouter.Redirect to={`${LanesModel.getLaneUrl(currentLane.id)}/~gallery`} />;
  }

  return null;
}
