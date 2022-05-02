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
  const viewedLane = lanesContext?.viewedLane;
  const readmeComponent = viewedLane?.readmeComponent;

  if (readmeComponent) {
    return <LaneReadme host={host} viewedLane={viewedLane} overviewSlot={overviewSlot} routeSlot={routeSlot} />;
  }

  if (viewedLane) {
    return <ReactRouter.Redirect to={`${LanesModel.getLaneUrl(viewedLane.id)}/~gallery`} />;
  }

  // throw 404
  return null;
}
