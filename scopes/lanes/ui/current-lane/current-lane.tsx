import React, { ReactNode, useMemo } from 'react';
import { useLocation } from '@teambit/base-ui.routing.routing-provider';
import { LanesModel, LanesProvider } from '@teambit/lanes.ui.lanes';

export type CurrentLaneFromUrlProps = {
  children: ReactNode;
};

export function CurrentLaneFromUrl({ children }: CurrentLaneFromUrlProps) {
  const location = useLocation();
  const currentLaneUrl = useMemo(() => LanesModel.getLaneUrlFromPathname(location.pathname), [location.pathname]);
  return <LanesProvider currentLaneUrl={currentLaneUrl}>{children}</LanesProvider>;
}
