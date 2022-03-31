import React, { ReactNode, useMemo } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { LanesModel, LanesProvider } from '@teambit/lanes.ui.lanes';

export type ViewedLaneFromUrlProps = {
  children: ReactNode;
};

export function ViewedLaneFromUrl({ children }: ViewedLaneFromUrlProps) {
  const location = useLocation();
  const viewedLaneId = useMemo(() => LanesModel.getLaneIdFromPathname(location.pathname), [location.pathname]);
  return <LanesProvider viewedLaneId={viewedLaneId}>{children}</LanesProvider>;
}
