import React, { ReactNode } from 'react';
import { LanesProvider } from '@teambit/lanes.hooks.use-lanes';
import { useViewedLane } from '@teambit/lanes.hooks.use-viewed-lane';

export type ViewedLaneFromUrlProps = {
  children: ReactNode;
};

export function ViewedLaneFromUrl({ children }: ViewedLaneFromUrlProps) {
  const viewedLaneId = useViewedLane();
  return <LanesProvider viewedLaneId={viewedLaneId}>{children}</LanesProvider>;
}
