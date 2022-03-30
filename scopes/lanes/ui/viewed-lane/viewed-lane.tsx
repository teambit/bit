import React, { ReactNode, useMemo } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { LanesModel, LanesProvider } from '@teambit/lanes.ui.lanes';

export type ViewedLaneFromUrlProps = {
  children: ReactNode;
  host: string;
};

export function ViewedLaneFromUrl({ children, host }: ViewedLaneFromUrlProps) {
  const location = useLocation();
  const viewedLaneId = useMemo(() => LanesModel.getLaneIdFromPathname(location.pathname), [location.pathname]);
  return (
    <LanesProvider viewedLaneId={viewedLaneId} host={host}>
      {children}
    </LanesProvider>
  );
}
