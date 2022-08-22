import React, { ReactNode } from 'react';
import { LanesProvider } from '@teambit/lanes.hooks.use-lanes';
import { useViewedLaneId } from '@teambit/lanes.hooks.use-viewed-lane-id';

export type ViewedLaneFromUrlProps = {
  children: ReactNode;
};

export function ViewedLaneFromUrl({ children }: ViewedLaneFromUrlProps) {
  const viewedLaneId = useViewedLaneId();
  return <LanesProvider viewedLaneId={viewedLaneId}>{children}</LanesProvider>;
}
