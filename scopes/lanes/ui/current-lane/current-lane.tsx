import React, { ReactNode, useMemo } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { LanesModel, LanesProvider } from '@teambit/lanes.ui.lanes';

export type CurrentLaneFromUrlProps = {
  children: ReactNode;
};

export function CurrentLaneFromUrl({ children }: CurrentLaneFromUrlProps) {
  const location = useLocation();
  const currentLaneId = useMemo(() => LanesModel.getLaneIdFromPathname(location.pathname), [location.pathname]);
  return <LanesProvider currentLaneId={currentLaneId}>{children}</LanesProvider>;
}
