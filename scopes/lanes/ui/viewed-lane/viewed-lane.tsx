import React, { ReactNode, useMemo } from 'react';
import { useLocation } from '@teambit/base-react.navigation.link';
import { LanesModel } from '@teambit/lanes.ui.models';
import { LanesProvider } from '@teambit/lanes.hooks.use-lanes';

export type ViewedLaneFromUrlProps = {
  children: ReactNode;
};

export function ViewedLaneFromUrl({ children }: ViewedLaneFromUrlProps) {
  const location = useLocation();
  const viewedLaneId = useMemo(
    () => location && LanesModel.getLaneIdFromPathname(location.pathname),
    [location?.pathname]
  );
  return <LanesProvider viewedLaneId={viewedLaneId}>{children}</LanesProvider>;
}
